# Android 商店測試版

應用程式：美髮開單。套件：`com.jun051873.salonpos`。Android 8.0 以上。

Google Play 一次性商品 `salon_pro_lifetime`，購買選項 `lifetime`，台灣含稅 NT$990。免費下載，無訂閱。網頁版保留功能預覽；Android 以 Google Play 簽章驗證購買紀錄，確認購買後解鎖，不消耗商品。網路失敗保留已驗證的離線購買憑證，成功恢復購買但查無商品則取消解鎖。

## 重建

1. 根目錄執行 `npm ci`、`npm run android:prepare`。
2. 使用 JDK 21、Android SDK 36；在本目錄 `local.properties` 填寫 SDK 位置。
3. 建立本機 `release.local.properties`，提供 `storeFile`、`storePassword`、`keyAlias`、`keyPassword`、`playPublicKey`。金鑰與密碼不在 Git，請使用交付的私人簽章備份；`playPublicKey` 取自本 App 的 Play Console 營利設定。缺公鑰時會禁止購買，不會跳過驗證。
4. `gradlew assembleRelease bundleRelease lintRelease testDebugUnitTest`。

勿將私密設定、簽署金鑰或 OAuth client secret 放進版本控制。Android 授權不使用 client secret；網頁僅使用公開 client ID。

## Google Drive

使用 `SalonPOS-System` 專案與 `drive.file` 範圍，已設定安裝版及 Play 版簽章各自的 OAuth Android 用戶端。授權給使用者自己的 Drive，備份先以密碼加密；無代管伺服器與跨裝置同步。權杖及密碼不持久保存，App 關閉後須重新連接。OS 自動備份已停用，避免明文店務資料進入系統備份。

## 已驗證與限制

2026-11-11：網頁回歸 83 項，82 通過、1 私人備份樣本測試略過；Android 購買簽章單元測試、release lint、APK/AAB 打包通過。Android 模擬器完成開單與 Activity 重建，以及停止程序後重啟讀取訂單，兩項通過。另四項模擬橋接測試涵蓋免費版限制、取消購買、恢復購買、加密備份。

模擬購買結果不等於實際 Google Play 測試購買。仍須用已登入且具授權測試資格的 Google Play 裝置完成測試購買、恢復購買及 Google Drive 真實授權／備份／還原；未聲稱 Android 實體裝置全部通過。Google Play 測試付款應明確顯示測試付款方式，否則不可當成免費測試交易。

## 1.0.1（2026-11-12）商店測試修正
- 購買入口改為可重試；以 BillingClient 當前連線狀態判定，不保留可能過期的 ready 旗標。每次購買前重新查詢一次性商品及方案 token，斷線可重連；空商品、取消、例外及逾時均顯示提示。
- 個人雲端頁面不再靜默跳回購買頁；明確顯示專業版需求、密碼驗證結果與授權進度。未驗證購買仍不能繞過付費限制。
- Android WebView 以系統列與 IME 邊界調整真正可見尺寸；網頁監聽 visualViewport、焦點及縮放，低處輸入欄位會捲入可見範圍。
- 預設及舊預設「專屬空間沙龍／專屬空間」顯示為「美髮開單」，自訂店名保留；手機和平板頁首使用採用圖示。
- 實際 Android 模擬器已驗證手機及平板橫直向開啟軟鍵盤後，材料百分比欄位保持可見；離線開單重建及重開讀取通過。
- 真實商店測試購買／恢復、Google Drive 授權與遠端備份還原仍需已登入的測試裝置；未把模擬橋接結果當成真實金流或雲端驗收。
