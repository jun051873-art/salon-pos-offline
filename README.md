# 專屬空間沙龍 POS — 單機測試版

版本：32.0。此專案獨立於店用雲端系統。

- 資料只寫入 salon_offline_* 本機儲存空間。
- 不連接 Firebase，不提供跨裝置同步。
- 保留 JSON 備份與還原；切換瀏覽器或主畫面入口前請備份。
- 主畫面啟動使用 standalone 顯示；Safari 分頁仍有網址列。
- 網址載入需連網，尚未提供離線啟動、商店打包及完整商用驗收。

## 建置

安裝 esbuild、react@19、react-dom@19，將 app.jsx 前加 React 與 react-dom/client 的 import，使用 esbuild bundle（classic JSX，Safari 15 / Chrome 100，production）後，把產出 script 接在 shell.html 後，再接 </body></html>。

## 本次驗證

8 個主頁伺服器渲染通過；JSON 還原與舊店用 storage key 隔離測試通過。實際 iPhone/iPad 加入主畫面仍需裝置驗收。未宣稱完整薪資、結帳流程已驗收。
