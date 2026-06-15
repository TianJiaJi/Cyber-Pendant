export function extractSnFromScan(rawValue) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    return (
      url.searchParams.get('sn') ||
      url.hash.match(/[?&]sn=([^&]+)/)?.[1] ||
      value
    ).toUpperCase();
  } catch {
    const match = value.match(/[?&]sn=([^&]+)/);
    return decodeURIComponent(match?.[1] || value).toUpperCase();
  }
}

export async function scanWithPlatform() {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    uni.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success(result) {
        resolve(extractSnFromScan(result.result));
      },
      fail(error) {
        reject(new Error(error.errMsg || '扫码失败'));
      }
    });
  });
  // #endif

  // #ifndef MP-WEIXIN
  throw new Error('当前平台请使用页面内摄像头扫码或手动输入 SN');
  // #endif
}
