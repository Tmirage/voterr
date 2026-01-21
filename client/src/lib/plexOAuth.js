const PLEX_API = 'https://plex.tv/api/v2';

function uuidv4() {
  return ((1e7).toString() + -1e3 + -4e3 + -8e3 + -1e11).replace(
    /[018]/g,
    function (c) {
      return (
        parseInt(c) ^
        (window.crypto.getRandomValues(new Uint8Array(1))[0] &
          (15 >> (parseInt(c) / 4)))
      ).toString(16);
    }
  );
}

class PlexOAuth {
  constructor() {
    this.pin = null;
    this.popup = null;
    this.headers = null;
  }

  initializeHeaders() {
    let clientId = localStorage.getItem('plex-client-id');
    if (!clientId) {
      clientId = uuidv4();
      localStorage.setItem('plex-client-id', clientId);
    }

    this.headers = {
      'Accept': 'application/json',
      'X-Plex-Client-Identifier': clientId,
      'X-Plex-Product': 'Voterr',
      'X-Plex-Version': '1.0.0',
      'X-Plex-Platform': 'Web',
      'X-Plex-Device': navigator.platform || 'Web',
      'X-Plex-Device-Name': 'Voterr'
    };
  }

  async getPin() {
    if (!this.headers) {
      throw new Error('Headers not initialized');
    }

    const response = await fetch(`${PLEX_API}/pins?strong=true`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to create Plex pin');
    }

    const data = await response.json();
    this.pin = { id: data.id, code: data.code };
    return this.pin;
  }

  preparePopup() {
    // Open popup to local loading page first to avoid popup blockers
    const width = 600;
    const height = 700;
    const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
    const screenWidth = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const screenHeight = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const left = screenWidth / 2 - width / 2 + dualScreenLeft;
    const top = screenHeight / 2 - height / 2 + dualScreenTop;

    this.popup = window.open(
      '/plex-loading',
      'PlexAuth',
      `scrollbars=yes,width=${width},height=${height},top=${top},left=${left}`
    );
    
    if (this.popup) {
      this.popup.focus();
    }
  }

  async login() {
    this.initializeHeaders();
    await this.getPin();

    if (!this.headers || !this.pin) {
      throw new Error('Unable to login - not initialized');
    }

    const params = {
      clientID: this.headers['X-Plex-Client-Identifier'],
      code: this.pin.code,
      'context[device][product]': 'Voterr',
      'context[device][version]': '1.0.0',
      'context[device][platform]': 'Web',
      'context[device][platformVersion]': '',
      'context[device][device]': navigator.platform || 'Web',
      'context[device][deviceName]': 'Voterr',
      'context[device][model]': 'Plex OAuth',
      'context[device][screenResolution]': `${window.screen.width}x${window.screen.height}`,
      'context[device][layout]': 'desktop'
    };

    const authUrl = `https://app.plex.tv/auth/#!?${this.encodeData(params)}`;

    if (this.popup) {
      this.popup.location.href = authUrl;
    }

    return this.pollForToken();
  }

  encodeData(data) {
    return Object.keys(data)
      .map(key => [key, data[key]].map(encodeURIComponent).join('='))
      .join('&');
  }

  async pollForToken() {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          if (!this.pin) {
            reject(new Error('No pin initialized'));
            return;
          }

          const response = await fetch(`${PLEX_API}/pins/${this.pin.id}`, {
            headers: this.headers
          });

          if (!response.ok) {
            throw new Error('Failed to check pin');
          }

          const data = await response.json();

          if (data.authToken) {
            this.closePopup();
            resolve(data.authToken);
          } else if (this.popup?.closed) {
            reject(new Error('Popup closed without completing login'));
          } else {
            setTimeout(poll, 1000);
          }
        } catch (e) {
          this.closePopup();
          reject(e);
        }
      };

      poll();
    });
  }

  closePopup() {
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }
    this.popup = null;
  }
}

export default PlexOAuth;
