package com.jun051873.salonpos;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/** Verify Google Play's signed purchase, never a flag supplied by the web page. */
public final class PurchaseVerifier {
    private PurchaseVerifier() {}
    public static boolean verify(String publicKey, String data, String signature) {
        if (publicKey == null || publicKey.trim().isEmpty() || data == null || signature == null) return false;
        try {
            var key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(publicKey)));
            var verifier = Signature.getInstance("SHA1withRSA");
            verifier.initVerify(key);
            verifier.update(data.getBytes(StandardCharsets.UTF_8));
            return verifier.verify(Base64.getDecoder().decode(signature));
        } catch (Exception ignored) { return false; }
    }
}

