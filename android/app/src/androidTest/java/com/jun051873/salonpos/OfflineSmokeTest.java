package com.jun051873.salonpos;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import android.webkit.WebView;
import android.view.ViewGroup;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class OfflineSmokeTest {
    private String js(ActivityScenario<MainActivity> scenario,String script)throws Exception{
        var result=new AtomicReference<String>();var latch=new CountDownLatch(1);
        scenario.onActivity(activity->{var root=(ViewGroup)activity.findViewById(android.R.id.content);var web=(WebView)((ViewGroup)root.getChildAt(0)).getChildAt(0);web.evaluateJavascript(script,value->{result.set(value);latch.countDown();});});
        assertTrue("JavaScript evaluation timed out",latch.await(10,TimeUnit.SECONDS));return result.get();
    }
    private void ready(ActivityScenario<MainActivity> scenario)throws Exception{
        for(int i=0;i<60;i++){if("true".equals(js(scenario,"!!document.querySelector('.app-shell') && !document.querySelector('.storage-alert')")))return;Thread.sleep(500);}
        fail("App did not become ready: "+js(scenario,"document.body.innerText"));
    }
    private void click(ActivityScenario<MainActivity> s,String text)throws Exception{
        assertEquals("true",js(s,"(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==="+org.json.JSONObject.quote(text)+");if(!b)return false;b.click();return true})()"));Thread.sleep(300);
    }
    @Test public void offlineCheckoutAndActivityRecreate()throws Exception{
        try(var scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);
            int before=Integer.parseInt(js(scenario,"JSON.parse(localStorage.getItem('salon_offline_database_v1')||'{\"data\":{}}').data.salon_offline_transactions?.length||0"));
            assertEquals("true",js(scenario,"(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('精緻剪髮'));if(!b)return false;b.click();return true})()"));Thread.sleep(300);
            click(scenario,"結帳收款");click(scenario,"現金");
            assertEquals(String.valueOf(before+1),js(scenario,"JSON.parse(localStorage.getItem('salon_offline_database_v1')).data.salon_offline_transactions.length"));
            click(scenario,"薪資條");assertEquals("true",js(scenario,"!!document.querySelector('.license-panel')"));
            scenario.recreate();ready(scenario);
            assertEquals(String.valueOf(before+1),js(scenario,"JSON.parse(localStorage.getItem('salon_offline_database_v1')).data.salon_offline_transactions.length"));
        }
    }
    @Test public void savedOrderReadableAfterProcessRestart()throws Exception{
        try(var scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);
            assertEquals("true",js(scenario,"(JSON.parse(localStorage.getItem('salon_offline_database_v1')||'{\"data\":{}}').data.salon_offline_transactions?.length||0)>0"));
            click(scenario,"查單管理");assertEquals("true",js(scenario,"document.body.innerText.includes('600')"));
        }
    }
    @Test public void keyboardKeepsLowMaterialInputVisible()throws Exception{
        try(var scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);click(scenario,"店家設定");click(scenario,"服務與商品");click(scenario,"新增項目");
            assertEquals("true",js(scenario,"(()=>{const label=[...document.querySelectorAll('label')].find(x=>x.textContent.includes('此服務另設材料'));if(!label)return false;label.querySelector('input').click();return true})()"));Thread.sleep(400);
            js(scenario,"(()=>{const s=document.querySelector('[aria-label=單項材料方式]');s.value='percent';s.dispatchEvent(new Event('change',{bubbles:true}));})()");Thread.sleep(400);
            // Exercise the real WebView + Android IME, not a mock viewport.
            assertEquals("true",js(scenario,"(()=>{const f=document.querySelector('[aria-label=單項材料數值]');if(!f)return false;f.scrollIntoView({block:'center'});return true})()"));Thread.sleep(300);
            var coordinates=new org.json.JSONArray(js(scenario,"(()=>{const r=document.querySelector('[aria-label=單項材料數值]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,devicePixelRatio]})()"));
            int[] origin=new int[2];scenario.onActivity(a->{var root=(ViewGroup)a.findViewById(android.R.id.content);((ViewGroup)root.getChildAt(0)).getChildAt(0).getLocationOnScreen(origin);});
            float x=(float)(origin[0]+coordinates.getDouble(0)*coordinates.getDouble(2)),y=(float)(origin[1]+coordinates.getDouble(1)*coordinates.getDouble(2));
            var instrumentation=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation();long now=android.os.SystemClock.uptimeMillis();
            instrumentation.sendPointerSync(android.view.MotionEvent.obtain(now,now,android.view.MotionEvent.ACTION_DOWN,x,y,0));
            instrumentation.sendPointerSync(android.view.MotionEvent.obtain(now,now+100,android.view.MotionEvent.ACTION_UP,x,y,0));
            Thread.sleep(1600);
            var imeVisible=new java.util.concurrent.atomic.AtomicBoolean();
            scenario.onActivity(a->imeVisible.set(androidx.core.view.ViewCompat.getRootWindowInsets(a.findViewById(android.R.id.content)).isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())));
            assertTrue("Real Android keyboard must be visible",imeVisible.get());
            assertEquals("true",js(scenario,"(()=>{const f=document.querySelector('[aria-label=單項材料數值]'),r=f.getBoundingClientRect(),body=f.closest('.salon-modal-body').getBoundingClientRect();return document.activeElement===f&&r.top>=body.top&&r.bottom<=body.bottom&&r.bottom<=visualViewport.height+visualViewport.offsetTop})()"));
            assertEquals("true",js(scenario,"document.querySelector('.salon-brand-icon').naturalWidth>0"));
            var proof=instrumentation.getUiAutomation().takeScreenshot();
            try(var out=new java.io.FileOutputStream(new java.io.File(instrumentation.getTargetContext().getExternalFilesDir(null),"keyboard-"+proof.getWidth()+"x"+proof.getHeight()+".png"))){proof.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}finally{proof.recycle();}
        }
    }
}
