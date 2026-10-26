package sh.ovis.app;

import android.content.ComponentName;
import android.content.Context;
import android.net.Uri;
import android.os.OutcomeReceiver;
import android.telecom.CallAttributes;
import android.telecom.CallControl;
import android.telecom.CallControlCallback;
import android.telecom.CallEndpoint;
import android.telecom.CallEventCallback;
import android.telecom.CallException;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

/**
 * The live call as Android's own phone call, as ChatGPT's voice registers it: a phone shows a call's
 * notification on the lock screen and in the status bar's call chip only for one. Telecom then
 * chooses where the sound goes; this keeps it off the earpiece unless a headset takes it.
 */
@RequiresApi(34)
final class TelecomCall {

    private final Executor main;
    private final Consumer<String> page;
    private CallControl control;
    private CallEndpoint endpoint;
    private List<CallEndpoint> endpoints = List.of();
    private boolean ended;

    /**
     * {@code page} gets "hangup" when Android ends the call, as for a phone call answered over it;
     * {@code refused} runs when Android takes no phone call.
     */
    TelecomCall(Context context, String name, Consumer<String> page, Runnable refused) {
        this.main = context.getMainExecutor();
        this.page = page;
        TelecomManager telecom = context.getSystemService(TelecomManager.class);
        PhoneAccountHandle handle = new PhoneAccountHandle(new ComponentName(context, LiveCallService.class), "live-voice");
        telecom.registerPhoneAccount(
            PhoneAccount.builder(handle, name)
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED | PhoneAccount.CAPABILITY_SUPPORTS_TRANSACTIONAL_OPERATIONS)
                .build()
        );
        CallAttributes attributes = new CallAttributes.Builder(handle, CallAttributes.DIRECTION_OUTGOING, name, Uri.parse("ovis:live"))
            .setCallType(CallAttributes.AUDIO_CALL)
            .build();
        telecom.addCall(attributes, main, new OutcomeReceiver<CallControl, CallException>() {
            @Override
            public void onResult(CallControl added) {
                control = added;
                if (ended) {
                    end();
                    return;
                }
                added.setActive(main, ignored());
            }

            @Override
            public void onError(@NonNull CallException error) {
                refused.run();
            }
        }, new Controls(), new Events());
    }

    void end() {
        ended = true;
        if (control == null) return;
        control.disconnect(new DisconnectCause(DisconnectCause.LOCAL), main, ignored());
        control = null;
    }

    /** The loudspeaker over the earpiece: a phone in the hand, not at the ear. */
    private void route() {
        if (control == null || endpoint == null || endpoint.getEndpointType() != CallEndpoint.TYPE_EARPIECE) return;
        for (CallEndpoint candidate : endpoints) {
            if (candidate.getEndpointType() == CallEndpoint.TYPE_SPEAKER) {
                control.requestCallEndpointChange(candidate, main, ignored());
                return;
            }
        }
    }

    private static <T> OutcomeReceiver<T, CallException> ignored() {
        return new OutcomeReceiver<>() {
            @Override
            public void onResult(T result) {}

            @Override
            public void onError(@NonNull CallException error) {}
        };
    }

    private final class Controls implements CallControlCallback {
        @Override
        public void onSetActive(@NonNull Consumer<Boolean> done) {
            done.accept(true);
        }

        @Override
        public void onSetInactive(@NonNull Consumer<Boolean> done) {
            done.accept(true);
        }

        @Override
        public void onAnswer(int videoState, @NonNull Consumer<Boolean> done) {
            done.accept(true);
        }

        @Override
        public void onDisconnect(@NonNull DisconnectCause cause, @NonNull Consumer<Boolean> done) {
            done.accept(true);
            control = null;
            if (!ended) {
                ended = true;
                page.accept("hangup");
            }
        }

        @Override
        public void onCallStreamingStarted(@NonNull Consumer<Boolean> done) {
            done.accept(false);
        }
    }

    private final class Events implements CallEventCallback {
        @Override
        public void onCallEndpointChanged(@NonNull CallEndpoint changed) {
            endpoint = changed;
            route();
        }

        @Override
        public void onAvailableCallEndpointsChanged(@NonNull List<CallEndpoint> available) {
            endpoints = available;
            route();
        }

        @Override
        public void onMuteStateChanged(boolean muted) {}

        @Override
        public void onCallStreamingFailed(int reason) {}

        @Override
        public void onEvent(@NonNull String event, @NonNull android.os.Bundle extras) {}
    }
}
