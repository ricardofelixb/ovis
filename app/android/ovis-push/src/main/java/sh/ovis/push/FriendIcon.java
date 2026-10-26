package sh.ovis.push;

import android.content.Context;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;

/**
 * The friend a workspace wears (shared/friends.ts) as a notification's large icon, drawn whole as
 * the sidebar draws it: no circle crop, which would clip ears and star points, and a margin so the
 * rounded corners newer Androids give the large icon leave them be. The pictures are byte copies
 * of src/assets/friends (src/conventions.test.ts keeps them so).
 */
public final class FriendIcon {
    // how much of the icon's side the picture fills
    private static final float FILL = 0.85f;

    private FriendIcon() {}

    /** null for no friend, a name this app does not know, or a picture that does not decode */
    public static Bitmap of(Context context, String friend) {
        int drawable = drawable(friend);
        if (drawable == 0) return null;
        Bitmap picture = BitmapFactory.decodeResource(context.getResources(), drawable);
        if (picture == null) return null;
        Resources resources = context.getResources();
        int width = resources.getDimensionPixelSize(android.R.dimen.notification_large_icon_width);
        int height = resources.getDimensionPixelSize(android.R.dimen.notification_large_icon_height);
        Bitmap icon = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        int side = Math.round(Math.min(width, height) * FILL);
        int left = (width - side) / 2;
        int top = (height - side) / 2;
        new Canvas(icon).drawBitmap(picture, null, new Rect(left, top, left + side, top + side), new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG));
        picture.recycle();
        return icon;
    }

    // a switch, not a lookup by name, so resource shrinking keeps every picture
    private static int drawable(String friend) {
        if (friend == null) return 0;
        switch (friend) {
            case "hoshi": return R.drawable.friend_hoshi;
            case "kokoro": return R.drawable.friend_kokoro;
            case "kuma": return R.drawable.friend_kuma;
            case "maru": return R.drawable.friend_maru;
            case "mikan": return R.drawable.friend_mikan;
            case "neko": return R.drawable.friend_neko;
            case "sankaku": return R.drawable.friend_sankaku;
            case "shikaku": return R.drawable.friend_shikaku;
            case "usagi": return R.drawable.friend_usagi;
            default: return 0;
        }
    }
}
