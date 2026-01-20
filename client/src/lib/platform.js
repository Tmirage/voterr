function getOS() {
  if (typeof window === 'undefined') return 'unknown';
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() || '';
  
  if (/iphone|ipad|ipod/.test(userAgent) || 
      (platform === 'macintel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/.test(userAgent)) {
    return 'android';
  }
  if (/mac/.test(platform)) {
    return 'mac';
  }
  if (/win/.test(platform)) {
    return 'windows';
  }
  if (/linux/.test(platform)) {
    return 'linux';
  }
  return 'unknown';
}

function isMac() {
  return getOS() === 'mac';
}

export function isTouch() {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function getModKey() {
  return isMac() ? '⌘' : 'Ctrl';
}
