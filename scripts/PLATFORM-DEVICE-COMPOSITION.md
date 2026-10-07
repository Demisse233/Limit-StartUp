# 多设备展示图维护

官网展示使用 `limitrss/assets/platforms/device-composition.png`，设备位置已合成在一张图片中，网页只等比缩放。

## 可编辑版本

- 分层 HTML / CSS 源文件：`scripts/platform-device-composition.html`
- iPhone：`limitrss/assets/platforms/framed-iphone.png`
- Android 手机：`limitrss/assets/platforms/framed-android.png`
- 华为三折叠：`limitrss/assets/platforms/framed-fold.png`
- iPad：`limitrss/assets/platforms/framed-ipad.png`
- MacBook：`limitrss/assets/platforms/framed-macbook.png`
- Windows：源文件中的 `.show-monitor`，目前为显示器占位。

这些独立素材和分层源文件必须保留，不可因官网使用合成图而删除。

## 预览和替换

在仓库根目录启动本地 HTTP 服务后，访问 `/scripts/platform-device-composition.html`。例如现有预览地址：

`http://localhost:8788/scripts/platform-device-composition.html`

源文件采用固定 1308 × 988 画布（含四边 64 px 留白），设备组合为 1180 × 860。每台设备都有独立 HTML 元素及 CSS 位置、比例和层级，可单独调整。

替换某台设备时，只更新对应的独立图片。若图片画布尺寸和透明留白与旧图完全相同，可以直接替换；若不同，需要同步更新该设备 `.framed-art` 的宽高比、图片内联 `width/left/top` 以及设备容器的宽高比，避免裁切或变形。图片定位应以机身可见边界为准，保留透明底，不能把网页上的负上边距重复加入源文件。

## 导出

1. 在固定 1308 × 988 浏览器视口打开源文件，等待所有图片解码完成。
2. 使用 3× 像素密度，设置页面和浏览器截图背景为透明，截取完整画布。
3. 输出 3924 × 2964 RGBA PNG，覆盖 `limitrss/assets/platforms/device-composition.png`。
4. 检查透明背景、各设备图片、层级和比例，并在官网预览宽屏与窄屏效果。
5. 如输出尺寸变化，同步官网图片元素的 `width` / `height` 属性。

官网 CSS 中 `.device-composition` 的负上边距只用于压缩合成图片顶部留白，不改变图内设备位置。源文件为开发维护素材，不需要在官网上添加编辑入口。
