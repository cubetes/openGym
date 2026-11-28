package ch.duartesantos.opengym.wear

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The phone's notifications are not bridged to a watch with this app (the rest alarm took the screen over the open app). */
class ManifestTest {
    @Test fun phoneNotificationsAreNotBridged() {
        val xml = File("src/main/AndroidManifest.xml").readText()
        assertTrue(Regex("""android:name="com\.google\.android\.wearable\.notificationBridgeMode"\s+android:value="NO_BRIDGING"""").containsMatchIn(xml))
    }
}
