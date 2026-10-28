package sh.ovis.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.function.Consumer;

/**
 * What the app's own pages (app/web) and the client's Change PC (src/lib/nativeApp.ts) ask of the
 * app: open a PC, forget one, go back to the connect screen. The iOS twin is HerdrShellPlugin.swift.
 * On Android it also shows the client's alerts, as the WebView has no Web Notifications.
 */
@CapacitorPlugin(name = "HerdrShell", permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"))
public class HerdrShellPlugin extends Plugin {
    // the channel and icon of push alerts (ovis-push), so both kinds look the same
    private static final String CHANNEL = "agent-alerts";
    private static final String TAP = "sh.ovis.app.ALERT_TAP";

    /** Hang up or Mute on the live call's notification, for this window's call to act on. */
    private final Consumer<String> callActions = action -> {
        JSObject event = new JSObject();
        event.put("action", action);
        notifyListeners("liveCallAction", event);
    };

    @Override
    public void load() {
        deliverTap(getActivity().getIntent());
    }

    @Override
    protected void handleOnDestroy() {
        // another window's call keeps its buttons
        if (LiveCallService.onAction == callActions) LiveCallService.onAction = null;
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliverTap(intent);
    }

    /** A tapped alert selects its pane, as public/sw.js's notificationclick does; kept until the page listens. */
    private void deliverTap(Intent intent) {
        if (intent == null || !TAP.equals(intent.getAction())) return;
        JSObject target = new JSObject();
        target.put("pane_id", intent.getStringExtra("pane_id"));
        target.put("machine_id", intent.getStringExtra("machine_id"));
        target.put("workspace_id", intent.getStringExtra("workspace_id"));
        intent.setAction(null);
        notifyListeners("alertTap", target, true);
    }

    /** granted, denied or prompt (the page's "default") */
    @PluginMethod
    public void alertsState(PluginCall call) {
        JSObject state = new JSObject();
        state.put("state", alertsState());
        call.resolve(state);
    }

    @PluginMethod
    public void requestAlerts(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "alertsAnswered");
            return;
        }
        alertsState(call);
    }

    @PermissionCallback
    private void alertsAnswered(PluginCall call) {
        alertsState(call);
    }

    private String alertsState() {
        if (Build.VERSION.SDK_INT >= 33) {
            PermissionState state = getPermissionState("notifications");
            if (state != PermissionState.GRANTED) return state == PermissionState.DENIED ? "denied" : "prompt";
        }
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied";
    }

    /**
     * title, body, tag (one alert per pane, replaced), the pane a tap opens (pane_id, machine_id,
     * workspace_id), and friend: the workspace's friend, the notification's picture
     */
    @PluginMethod
    public void alert(PluginCall call) {
        if (!"granted".equals(alertsState())) {
            call.resolve();
            return;
        }
        getContext().getSystemService(NotificationManager.class).createNotificationChannel(
            new NotificationChannel(CHANNEL, getContext().getString(sh.ovis.push.R.string.ovis_push_channel), NotificationManager.IMPORTANCE_HIGH)
        );
        Intent open = new Intent(getContext(), MainActivity.class).setAction(TAP)
            .putExtra("pane_id", call.getString("pane_id"))
            .putExtra("machine_id", call.getString("machine_id", "local"))
            .putExtra("workspace_id", call.getString("workspace_id"));
        String tag = call.getString("tag", "ovis");
        PendingIntent tap = PendingIntent.getActivity(getContext(), tag.hashCode(), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String body = call.getString("body", "");
        NotificationCompat.Builder notification = new NotificationCompat.Builder(getContext(), CHANNEL)
            .setSmallIcon(sh.ovis.push.R.drawable.ic_stat_ovis)
            .setColor(0xFF2E3A59)
            .setContentTitle(call.getString("title", "Ovis"))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(tap);
        android.graphics.Bitmap face = sh.ovis.push.FriendIcon.of(getContext(), call.getString("friend"));
        if (face != null) notification.setLargeIcon(face);
        NotificationManagerCompat.from(getContext()).notify(tag, 0, notification.build());
        call.resolve();
    }

    /** A live call has the microphone: keep it going out of sight, under a notification of title and body. */
    @PluginMethod
    public void liveCallStarted(PluginCall call) {
        // the window whose page has the call takes the notification's buttons
        LiveCallService.onAction = callActions;
        try {
            LiveCallService.start(getActivity(), call.getString("title", "Ovis"), call.getString("body", ""),
                call.getString("mute", "Mute"), call.getString("unmute", "Unmute"));
        } catch (RuntimeException outOfSight) {
            // the app left view before the microphone was allowed: the call goes on only while it is in view
        }
        call.resolve();
    }

    @PluginMethod
    public void liveCallEnded(PluginCall call) {
        LiveCallService.stop(getActivity());
        call.resolve();
    }

    @PluginMethod
    public void liveCallMuted(PluginCall call) {
        LiveCallService.setMuted(call.getBoolean("muted", false));
        call.resolve();
    }
    @PluginMethod
    public void getState(PluginCall call) {
        JSObject state = new JSObject();
        state.put("saved", new JSArray(PCStore.saved(getContext())));
        String current = PCStore.current(getContext());
        String last = PCStore.last(getContext());
        state.put("current", current == null ? "" : current);
        state.put("last", last == null ? "" : last);
        state.put("failure", PCStore.failure == null ? "" : PCStore.failure);
        call.resolve(state);
    }

    /** url: an http or https address; its origin is remembered, and the address itself (a pairing link's code included) is the first page. */
    @PluginMethod
    public void open(PluginCall call) {
        String text = call.getString("url");
        String origin = text == null ? null : PCStore.origin(text);
        if (origin == null) {
            call.reject("That is not an http or https address.");
            return;
        }
        PCStore.open(getContext(), origin, text);
        PCStore.failure = null;
        call.resolve();
        reopen(origin);
    }

    @PluginMethod
    public void forget(PluginCall call) {
        String origin = call.getString("url");
        if (origin != null) PCStore.forget(getContext(), origin);
        call.resolve();
    }

    /** Back to the connect screen; the PC stays in the list. */
    @PluginMethod
    public void disconnect(PluginCall call) {
        PCStore.setCurrent(getContext(), null);
        call.resolve();
        reopen(null);
    }

    /** Opens this window's PC again from its first page. */
    @PluginMethod
    public void retry(PluginCall call) {
        PCStore.failure = null;
        call.resolve();
        reopen(window().origin());
    }

    /** url: an address of this window's PC, opened in another window beside this one (MainActivity.openWindow). */
    @PluginMethod
    public void openWindow(PluginCall call) {
        String url = call.getString("url");
        String own = window().origin();
        if (url == null || own == null || !own.equals(PCStore.origin(url))) {
            call.reject("A new window opens only an address of this window's PC.");
            return;
        }
        getActivity().runOnUiThread(() -> window().openWindow(url));
        call.resolve();
    }

    private MainActivity window() {
        return (MainActivity) getActivity();
    }

    private void reopen(String origin) {
        getActivity().runOnUiThread(() -> window().reopen(origin));
    }
}
