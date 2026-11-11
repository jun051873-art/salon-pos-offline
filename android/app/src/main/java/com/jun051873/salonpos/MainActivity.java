package com.jun051873.salonpos;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.view.*;
import android.webkit.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.webkit.*;
import com.android.billingclient.api.*;
import com.google.android.gms.auth.api.identity.*;
import com.google.android.gms.common.api.Scope;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends ComponentActivity {
    private static final String ORIGIN="https://appassets.androidplatform.net";
    private static final String HOME=ORIGIN+"/assets/index.html";
    private static final String DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
    private WebView web;
    private BillingClient billing;
    private ProductDetails product;
    private boolean pro=false, billingReady=false, pageReady=false;
    private String billingMessage="正在連接 Google Play…", purchaseRequest=null, authRequest=null;
    private String driveToken=null;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private ValueCallback<Uri[]> uploadCallback;
    private String saveId=null,saveText=null;
    private ActivityResultLauncher<Intent> uploadLauncher,saveLauncher;
    private ActivityResultLauncher<IntentSenderRequest> authLauncher;

    private static JSONObject object(Object... fields) {
        JSONObject o=new JSONObject();
        try { for(int i=0;i<fields.length;i+=2)o.put((String)fields[i],fields[i+1]); }catch(JSONException e){throw new IllegalArgumentException(e);}
        return o;
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        registerLaunchers();
        web=new WebView(this);
        web.setBackgroundColor(0xfff6f7fa);
        web.setOnApplyWindowInsetsListener((view,insets)->{
            if(android.os.Build.VERSION.SDK_INT>=30){var edge=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());view.setPadding(edge.left,edge.top,edge.right,edge.bottom);}
            else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(web);
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                if(!"appassets.androidplatform.net".equals(request.getUrl().getHost()))return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri u=request.getUrl();
                if(HOME.equals(u.toString()))return false;
                if(request.isForMainFrame()&&"https".equals(u.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
                return true;
            }
            @Override public void onPageFinished(WebView view,String url){pageReady=HOME.equals(url);publish();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("確定",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("確定",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(uploadCallback!=null)uploadCallback.onReceiveValue(null);uploadCallback=callback;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                uploadLauncher.launch(pick);return true;
            }
        });
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            new AlertDialog.Builder(this).setMessage("請先更新 Android System WebView，再開啟美髮開單。").setPositiveButton("關閉",(d,w)->finish()).setCancelable(false).show();return;
        }
        WebViewCompat.addWebMessageListener(web,"SalonNative",Collections.singleton(ORIGIN),(view,message,sourceOrigin,mainFrame,reply)->{
            if(!mainFrame||!ORIGIN.equals(sourceOrigin.toString()))return;
            try{handle(new JSONObject(message.getData()));}catch(Exception e){ /* Malformed messages have no authority. */ }
        });
        pro=readCachedPurchase();
        billing=BillingClient.newBuilder(this).setListener((result,purchases)->{
            String request=purchaseRequest;purchaseRequest=null;
            if(result.getResponseCode()==BillingClient.BillingResponseCode.OK&&purchases!=null)processPurchases(purchases,false,request);
            else if(result.getResponseCode()==BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED)queryOwned(request);
            else {billingMessage=result.getResponseCode()==BillingClient.BillingResponseCode.USER_CANCELED?"已取消購買，未變更功能":"購買未完成，請稍後重試（"+result.getResponseCode()+"）";publish();respond(request,null,billingMessage);}
        }).enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).enableAutoServiceReconnection().build();
        billing.startConnection(new BillingClientStateListener(){
            public void onBillingSetupFinished(BillingResult result){billingReady=result.getResponseCode()==BillingClient.BillingResponseCode.OK;if(billingReady){loadProduct();queryOwned(null);}else{billingMessage="無法連接 Google Play；已購買的離線授權仍保留";publish();}}
            public void onBillingServiceDisconnected(){billingReady=false;billingMessage="Google Play 暫時離線";publish();}
        });
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){public void handleOnBackPressed(){
            web.evaluateJavascript("window.dispatchEvent(new Event('salon-back'))",null);
        }});
        web.loadUrl(HOME);
    }
    private void registerLaunchers(){
        uploadLauncher=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),result->{
            if(uploadCallback!=null){Uri uri=result.getResultCode()==RESULT_OK&&result.getData()!=null?result.getData().getData():null;uploadCallback.onReceiveValue(uri==null?null:new Uri[]{uri});uploadCallback=null;}
        });
        saveLauncher=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),result->{
            String id=saveId,text=saveText;saveId=null;saveText=null;
            if(result.getResultCode()!=RESULT_OK||result.getData()==null){respond(id,null,"已取消儲存");return;}
            Uri uri=result.getData().getData();network.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));respond(id,object("saved",true),null);}catch(Exception e){respond(id,null,"檔案未儲存，請重試");}});
        });
        authLauncher=registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(),result->{
            String id=authRequest;authRequest=null;
            if(result.getResultCode()!=RESULT_OK){respond(id,null,"已取消 Google 授權，本機資料不變");return;}
            try{finishAuthorization(id,Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(result.getData()));}catch(Exception e){respond(id,null,"Google 授權未完成，請確認此版本的商店簽章已設定");}
        });
    }
    private void handle(JSONObject request){
        String id=request.optString("id"),method=request.optString("method");JSONObject p=request.optJSONObject("params");if(p==null)p=new JSONObject();
        switch(method){
            case "billingState": respond(id,billingState(),null);break;
            case "restorePurchases": if(billingReady)queryOwned(id);else respond(id,null,"請連上網路並確認 Google Play 已登入，再恢復購買");break;
            case "purchase": buy(id);break;
            case "driveConnect": if(!pro){respond(id,null,"自動雲端備份需專業版");break;}authorizeDrive(id,true);break;
            case "driveDisconnect": driveToken=null;respond(id,object("disconnected",true),null);break;
            case "driveUpload": case "driveList": case "driveRead":
                if(!pro){respond(id,null,"自動雲端備份需專業版");break;}
                final JSONObject params=p;withDriveToken(id,()->driveRequest(id,method,params));break;
            case "saveText":
                if(saveId!=null){respond(id,null,"請先完成目前的檔案儲存");break;}
                String text=p.optString("text");if(text.length()>16*1024*1024){respond(id,null,"備份過大，請先匯出分段資料");break;}
                saveId=id;saveText=text;String name=p.optString("name","salon-backup.json").replaceAll("[\\\\/:*?\"<>|]","_");
                saveLauncher.launch(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(name.endsWith(".html")?"text/html":"application/json").putExtra(Intent.EXTRA_TITLE,name));break;
            case "print": ((PrintManager)getSystemService(PRINT_SERVICE)).print("美髮開單",web.createPrintDocumentAdapter("美髮開單"),null);respond(id,object("opened",true),null);break;
            case "exit": moveTaskToBack(true);respond(id,object("ok",true),null);break;
            default:respond(id,null,"不支援的操作");
        }
    }
    private JSONObject billingState(){return object("native",true,"pro",pro,"ready",billingReady,"canPurchase",billingReady&&product!=null&&!BuildConfig.PLAY_PUBLIC_KEY.trim().isEmpty(),"price",price(),"message",billingMessage,"productId",BuildConfig.PRO_PRODUCT_ID);}
    private String price(){if(product!=null&&product.getOneTimePurchaseOfferDetails()!=null)return product.getOneTimePurchaseOfferDetails().getFormattedPrice();return "NT$990";}
    private void publish(){if(pageReady)runOnUiThread(()->web.evaluateJavascript("window.dispatchEvent(new CustomEvent('salon-billing',{detail:"+billingState()+"}))",null));}
    private void respond(String id,JSONObject value,String error){if(id==null||id.isEmpty())return;JSONObject r=object("id",id,"result",value==null?JSONObject.NULL:value,"error",error==null?JSONObject.NULL:error);runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.__salonNativeReply && window.__salonNativeReply("+r+")",null);});}
    private void loadProduct(){billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder().setProductId(BuildConfig.PRO_PRODUCT_ID).setProductType(BillingClient.ProductType.INAPP).build())).build(),(result,details)->{
        product=result.getResponseCode()==0&&!details.getProductDetailsList().isEmpty()?details.getProductDetailsList().get(0):null;
        if(BuildConfig.PLAY_PUBLIC_KEY.trim().isEmpty())billingMessage="商店購買驗證尚未設定，暫不開放付款";
        else if(product==null)billingMessage="商品尚未提供，請從 Google Play 測試連結安裝";
        else billingMessage=pro?"專業版已解鎖，無訂閱年費":"一次購買，永久解鎖此專業版";
        publish();
    });}
    private void buy(String id){
        if(pro){respond(id,billingState(),null);return;}
        if(purchaseRequest!=null){respond(id,null,"購買正在處理，請勿重複操作");return;}
        if(!billingReady||product==null||BuildConfig.PLAY_PUBLIC_KEY.trim().isEmpty()){respond(id,null,"商店商品或購買驗證尚未就緒，未發起付款");return;}
        var detail=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product);
        var offer=product.getOneTimePurchaseOfferDetails();if(offer!=null&&offer.getOfferToken()!=null)detail.setOfferToken(offer.getOfferToken());
        purchaseRequest=id;
        BillingResult result=billing.launchBillingFlow(this,BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(detail.build())).build());
        if(result.getResponseCode()!=0){purchaseRequest=null;respond(id,null,"無法開啟商店付款（"+result.getResponseCode()+"）");}
    }
    private void queryOwned(String id){billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),(result,purchases)->{
        if(result.getResponseCode()==0)processPurchases(purchases,true,id);
        else respond(id,null,"無法確認購買；既有離線授權保留，請稍後重試");
    });}
    private boolean valid(Purchase p){return p.getPurchaseState()==Purchase.PurchaseState.PURCHASED&&p.getProducts().contains(BuildConfig.PRO_PRODUCT_ID)&&getPackageName().equals(p.getPackageName())&&PurchaseVerifier.verify(BuildConfig.PLAY_PUBLIC_KEY,p.getOriginalJson(),p.getSignature());}
    private boolean readCachedPurchase(){
        var prefs=getSharedPreferences("play-entitlement",MODE_PRIVATE);
        try{return valid(new Purchase(prefs.getString("receipt",""),prefs.getString("signature","")));}catch(Exception e){return false;}
    }
    private void processPurchases(List<Purchase> purchases,boolean authoritative,String id){
        Purchase owned=null;boolean pending=false;
        for(Purchase p:purchases)if(p.getProducts().contains(BuildConfig.PRO_PRODUCT_ID)){if(valid(p))owned=p;if(p.getPurchaseState()==Purchase.PurchaseState.PENDING)pending=true;}
        if(owned==null){
            if(authoritative){pro=false;getSharedPreferences("play-entitlement",MODE_PRIVATE).edit().clear().apply();}
            billingMessage=pending?"付款待確認；完成付款並驗證後才會解鎖":BuildConfig.PLAY_PUBLIC_KEY.trim().isEmpty()?"商店驗證尚未設定":"目前帳號沒有專業版購買紀錄";publish();respond(id,billingState(),null);return;
        }
        final Purchase purchase=owned;
        Runnable grant=()->{getSharedPreferences("play-entitlement",MODE_PRIVATE).edit().putString("receipt",purchase.getOriginalJson()).putString("signature",purchase.getSignature()).apply();pro=true;billingMessage="專業版已解鎖，無訂閱年費";publish();respond(id,billingState(),null);};
        if(purchase.isAcknowledged())grant.run();
        else billing.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.getPurchaseToken()).build(),result->{if(result.getResponseCode()==0)grant.run();else{billingMessage="購買確認尚未完成，請點恢復購買重試";publish();respond(id,null,billingMessage);}});
    }
    private void authorizeDrive(String id,boolean interactive){
        if(authRequest!=null){respond(id,null,"已有 Google 授權正在處理");return;}
        Identity.getAuthorizationClient(this).authorize(AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE))).build()).addOnSuccessListener(result->{
            if(result.hasResolution()){
                if(!interactive){respond(id,null,"Google 授權已失效，請重新連接");return;}
                authRequest=id;authLauncher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
            }else finishAuthorization(id,result);
        }).addOnFailureListener(e->respond(id,null,"Google 連線失敗，請確認網路及此 App 的 Google 授權設定"));
    }
    private void finishAuthorization(String id,AuthorizationResult result){driveToken=result.getAccessToken();if(driveToken==null||driveToken.isEmpty())respond(id,null,"未取得 Google Drive 授權");else respond(id,object("token","native","expiresAt",System.currentTimeMillis()+3500000),null);}
    private void withDriveToken(String id,Runnable action){
        Identity.getAuthorizationClient(this).authorize(AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE))).build()).addOnSuccessListener(result->{
            if(result.hasResolution()||result.getAccessToken()==null){respond(id,null,"Google 授權已失效，請重新連接");return;}driveToken=result.getAccessToken();network.execute(action);
        }).addOnFailureListener(e->respond(id,null,"Google 連線失敗，備份尚未完成"));
    }
    private void driveRequest(String id,String method,JSONObject params){
        try{
            if(method.equals("driveUpload")){
                JSONObject encrypted=params.getJSONObject("encrypted");if(!"salon-encrypted-backup".equals(encrypted.optString("format")))throw new IOException("拒絕未加密的雲端備份");
                String boundary="salon_"+UUID.randomUUID(),name="salon-backup-"+System.currentTimeMillis()+"-"+UUID.randomUUID()+".json";
                String metadata=object("name",name,"mimeType","application/json","appProperties",object("salonBackup","1")).toString();
                String body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+encrypted+"\r\n--"+boundary+"--";
                respond(id,new JSONObject(http("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name","POST","multipart/related; boundary="+boundary,body)),null);
            }else if(method.equals("driveList")){
                String query=URLEncoder.encode("trashed = false and appProperties has { key='salonBackup' and value='1' }","UTF-8");
                respond(id,new JSONObject(http("https://www.googleapis.com/drive/v3/files?q="+query+"&fields=files(id,name,createdTime)&orderBy=createdTime%20desc&pageSize=30","GET",null,null)),null);
            }else{
                String file=params.optString("fileId");if(!file.matches("[A-Za-z0-9_-]+"))throw new IOException("備份編號無效");
                JSONObject data=new JSONObject(http("https://www.googleapis.com/drive/v3/files/"+file+"?alt=media","GET",null,null));
                if(!"salon-encrypted-backup".equals(data.optString("format")))throw new IOException("此檔案不是加密備份");respond(id,data,null);
            }
        }catch(Exception e){respond(id,null,e instanceof IOException?e.getMessage():"備份資料格式不正確，原資料未變更");}
    }
    private String http(String url,String method,String contentType,String body)throws IOException{
        var conn=(HttpURLConnection)new URL(url).openConnection();
        try{
            conn.setConnectTimeout(20000);conn.setReadTimeout(30000);conn.setInstanceFollowRedirects(false);conn.setRequestMethod(method);conn.setRequestProperty("Authorization","Bearer "+driveToken);
            if(body!=null){conn.setDoOutput(true);conn.setRequestProperty("Content-Type",contentType);byte[] bytes=body.getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(bytes.length);try(var out=conn.getOutputStream()){out.write(bytes);}}
            int code=conn.getResponseCode();if(code<200||code>=300)throw new IOException(code==401?"Google 授權過期，請重新連接":code==403?"Google Drive 權限、API 設定或空間不足":"雲端操作失敗（"+code+"），請重試");
            try(var in=conn.getInputStream();var out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int read;while((read=in.read(buffer))!=-1){if(out.size()+read>16*1024*1024)throw new IOException("備份超過可處理大小");out.write(buffer,0,read);}return out.toString("UTF-8");}
        }finally{conn.disconnect();}
    }
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();if(billing!=null&&billing.isReady())queryOwned(null);}
    @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
    @Override protected void onDestroy(){if(billing!=null)billing.endConnection();network.shutdown();if(web!=null){web.destroy();web=null;}super.onDestroy();}
}

