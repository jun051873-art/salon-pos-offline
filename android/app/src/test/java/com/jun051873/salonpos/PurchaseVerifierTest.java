package com.jun051873.salonpos;
import org.junit.Test;
import static org.junit.Assert.*;
import java.security.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
public class PurchaseVerifierTest {
    @Test public void tamperedAndWrongKeyReceiptsCannotUnlock() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048);
        var pair = generator.generateKeyPair();
        String receipt = "{\"productId\":\"salon_pro_lifetime\",\"purchaseState\":0}";
        var signer=Signature.getInstance("SHA1withRSA"); signer.initSign(pair.getPrivate()); signer.update(receipt.getBytes(StandardCharsets.UTF_8));
        String signature=Base64.getEncoder().encodeToString(signer.sign());
        String key=Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());
        assertTrue(PurchaseVerifier.verify(key,receipt,signature));
        assertFalse(PurchaseVerifier.verify(key,receipt+" ",signature));
        assertFalse(PurchaseVerifier.verify("",receipt,signature));
        assertFalse(PurchaseVerifier.verify(Base64.getEncoder().encodeToString(generator.generateKeyPair().getPublic().getEncoded()),receipt,signature));
    }
}
