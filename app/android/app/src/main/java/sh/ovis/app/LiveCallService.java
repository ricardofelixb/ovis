package sh.ovis.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Keeps a live call (src/lib/piVoiceSession.ts) going once the app is out of sight or the screen
 * is locked: Android lets only a foreground service of the microphone type go on recording, and
 * keeps its process and network up meanwhile. The page starts it once the call has the
 * microphone and stops it when the call lets go of it.
 *
 * It also plays the call on the loudspeaker when no headset is connected: Android sends a call's
 * sound to the earpiece, which is held to the ear. A headset, wired or Bluetooth, keeps the call,
 * its microphone included. Android before 12 keeps its own choice.
 */
public class LiveCallService extends Service {
    private static final String CHANNEL = "live-call";
    private static final int ID = 1;

    private AudioManager audio;
    // a headset plugged in or taken out mid-call
    private final AudioDeviceCallback devices = new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
            route();
        }

        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
            route();
        }
    };
    // the WebView starting its call's sound puts it back on the earpiece
    private AudioManager.OnCommunicationDeviceChangedListener changed;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT < 31) return;
        audio = getSystemService(AudioManager.class);
        changed = device -> {
            if (device != null && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) route();
        };
        audio.addOnCommunicationDeviceChangedListener(getMainExecutor(), changed);
        audio.registerAudioDeviceCallback(devices, new Handler(Looper.getMainLooper()));
        route();
    }

    /** The loudspeaker, unless a headset is there to take the call. */
    private void route() {
        if (Build.VERSION.SDK_INT < 31) return;
        AudioDeviceInfo speaker = null;
        for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) {
            int type = device.getType();
            if (type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) speaker = device;
            else if (type != AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                // wired, USB or Bluetooth: Android's own choice is the headset
                audio.clearCommunicationDevice();
                return;
            }
        }
        if (speaker != null) audio.setCommunicationDevice(speaker);
    }

    @Override
    public void onDestroy() {
        if (Build.VERSION.SDK_INT >= 31) {
            audio.unregisterAudioDeviceCallback(devices);
            audio.removeOnCommunicationDeviceChangedListener(changed);
            audio.clearCommunicationDevice();
        }
        super.onDestroy();
    }

    /** Throws when the app is no longer in view, where Android starts no service. */
    static void start(Context context, String title, String body) {
        context.startService(new Intent(context, LiveCallService.class).putExtra("title", title).putExtra("body", body));
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, LiveCallService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent == null ? null : intent.getStringExtra("title");
        String body = intent == null ? null : intent.getStringExtra("body");
        if (title == null) title = "Ovis";
        getSystemService(NotificationManager.class).createNotificationChannel(
            new NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_LOW)
        );
        // a tap goes back to the app as its launcher icon does
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(sh.ovis.push.R.drawable.ic_stat_ovis)
            .setColor(0xFF2E3A59)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE))
            .build();
        try {
            ServiceCompat.startForeground(this, ID, notification, Build.VERSION.SDK_INT >= 30 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0);
        } catch (RuntimeException refused) {
            // no microphone permission, or no longer in view: the call goes on only while the app is
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /** Swiped away from the recent apps: the page, and its call, are gone. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
