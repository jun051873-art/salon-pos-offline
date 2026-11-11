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
        scenario.onActivity(activity->{var root=(ViewGroup)activity.findViewById(android.R.id.content);var web=(WebView)root.getChildAt(0);web.evaluateJavascript(script,value->{result.set(value);latch.countDown();});});
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
}
