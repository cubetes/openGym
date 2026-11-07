package ch.duartesantos.opengym.wear

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The rest-over buzz with the app in the background: the app's own timer stops when Android puts
 * it to sleep (no heart-rate permission, so no WorkoutService to keep it running), so an alarm at
 * the rest's end buzzes too, the phone app's RestAlert fallback. Exact when the watch allows it,
 * else "while idle" (it can come a little late in Doze). The rest buzzes once either way
 * (WearStore.claimRestBuzz, RestMath.buzzDue).
 */
class RestOverReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        WearStore.init(ctx)
        if (WearStore.claimRestBuzz(intent.getLongExtra(ENDS_AT, 0))) Haptics.restOver(ctx)
    }

    companion object {
        private const val ENDS_AT = "endsAt"

        private fun pending(ctx: Context, endsAt: Long): PendingIntent = PendingIntent.getBroadcast(
            ctx, 0, Intent(ctx, RestOverReceiver::class.java).putExtra(ENDS_AT, endsAt),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        /** The alarm for this rest's end; it replaces the one before (a ±15, a new rest). */
        fun schedule(ctx: Context, endsAt: Long) {
            val am = ctx.getSystemService(AlarmManager::class.java) ?: return
            val pi = pending(ctx, endsAt)
            try {
                // Before Android 12 an exact alarm needs no permission.
                if (android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
            } catch (_: SecurityException) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
            }
        }

        /** The rest ended another way (Skip, a set logged, the workout over): no alarm. */
        fun cancel(ctx: Context) {
            ctx.getSystemService(AlarmManager::class.java)?.cancel(pending(ctx, 0))
        }
    }
}
