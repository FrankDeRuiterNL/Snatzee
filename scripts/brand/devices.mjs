/**
 * Apple splash-screen targets.
 *
 * iOS only shows a startup image when a `<link rel="apple-touch-startup-image">`
 * matches the device exactly, so every supported screen needs its own file in
 * both orientations, sized in device pixels (CSS points × pixel ratio).
 */
export const APPLE_DEVICES = [
  { name: 'iphone-se',           width: 320,  height: 568,  ratio: 2 },
  { name: 'iphone-8',            width: 375,  height: 667,  ratio: 2 },
  { name: 'iphone-8-plus',       width: 414,  height: 736,  ratio: 3 },
  { name: 'iphone-x',            width: 375,  height: 812,  ratio: 3 },
  { name: 'iphone-xr',           width: 414,  height: 896,  ratio: 2 },
  { name: 'iphone-xs-max',       width: 414,  height: 896,  ratio: 3 },
  { name: 'iphone-12',           width: 390,  height: 844,  ratio: 3 },
  { name: 'iphone-12-pro-max',   width: 428,  height: 926,  ratio: 3 },
  { name: 'iphone-14-pro',       width: 393,  height: 852,  ratio: 3 },
  { name: 'iphone-14-pro-max',   width: 430,  height: 932,  ratio: 3 },
  { name: 'iphone-16-pro',       width: 402,  height: 874,  ratio: 3 },
  { name: 'iphone-16-pro-max',   width: 440,  height: 956,  ratio: 3 },
  { name: 'ipad-mini',           width: 768,  height: 1024, ratio: 2 },
  { name: 'ipad-10-2',           width: 810,  height: 1080, ratio: 2 },
  { name: 'ipad-10-9',           width: 820,  height: 1180, ratio: 2 },
  { name: 'ipad-air-10-5',       width: 834,  height: 1112, ratio: 2 },
  { name: 'ipad-pro-11',         width: 834,  height: 1194, ratio: 2 },
  { name: 'ipad-pro-12-9',       width: 1024, height: 1366, ratio: 2 },
]

/** Icon sizes: Apple touch icons, PWA icons and favicons. */
export const ICON_TARGETS = [
  { file: 'apple-touch-icon.png',      size: 180 },
  { file: 'apple-touch-icon-180.png',  size: 180 },
  { file: 'apple-touch-icon-167.png',  size: 167 },
  { file: 'apple-touch-icon-152.png',  size: 152 },
  { file: 'apple-touch-icon-120.png',  size: 120 },
  { file: 'apple-touch-icon-76.png',   size: 76 },
  { file: 'apple-touch-icon-60.png',   size: 60 },
  { file: 'icon-96.png',               size: 96 },
  { file: 'icon-192.png',              size: 192 },
  { file: 'icon-256.png',              size: 256 },
  { file: 'icon-384.png',              size: 384 },
  { file: 'icon-512.png',              size: 512 },
  { file: 'icon-1024.png',             size: 1024 },
  { file: 'favicon-16.png',            size: 16 },
  { file: 'favicon-32.png',            size: 32 },
  { file: 'favicon-48.png',            size: 48 },
]

export const MASKABLE_TARGETS = [
  { file: 'icon-maskable-192.png', size: 192 },
  { file: 'icon-maskable-512.png', size: 512 },
]

export function splashTargets() {
  return APPLE_DEVICES.flatMap((device) => [
    {
      file: `splash-${device.name}-portrait.png`,
      width: device.width * device.ratio,
      height: device.height * device.ratio,
      media: `(device-width: ${device.width}px) and (device-height: ${device.height}px) and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: portrait)`,
    },
    {
      file: `splash-${device.name}-landscape.png`,
      width: device.height * device.ratio,
      height: device.width * device.ratio,
      media: `(device-width: ${device.width}px) and (device-height: ${device.height}px) and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: landscape)`,
    },
  ])
}
