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
