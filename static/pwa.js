(() => {
  const offlineBanner = document.getElementById('offline-banner');
  const updateNetworkState = () => {
    if (offlineBanner) offlineBanner.hidden = navigator.onLine;
  };
  window.addEventListener('online', updateNetworkState);
  window.addEventListener('offline', updateNetworkState);
  updateNetworkState();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
  }

  let installPrompt = null;
  const installButton = document.getElementById('install-app');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });
  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!installPrompt) return;
      await installPrompt.prompt();
      installPrompt = null;
      installButton.hidden = true;
    });
  }

  const locationButton = document.getElementById('use-location');
  const locationStatus = document.getElementById('location-status');
  if (locationButton && locationStatus) {
    locationButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        locationStatus.textContent = 'Standortfunktion wird von diesem Gerät nicht unterstützt.';
        return;
      }
      locationButton.disabled = true;
      locationStatus.textContent = 'Standort wird ermittelt …';
      navigator.geolocation.getCurrentPosition(
        position => {
          const latitude = document.getElementById('latitude');
          const longitude = document.getElementById('longitude');
          if (latitude) latitude.value = position.coords.latitude.toFixed(6);
          if (longitude) longitude.value = position.coords.longitude.toFixed(6);
          locationStatus.textContent = 'Standort wurde der Meldung hinzugefügt.';
          locationButton.disabled = false;
        },
        () => {
          locationStatus.textContent = 'Standort konnte nicht übernommen werden. Bitte den Ort manuell eintragen.';
          locationButton.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  const photoInput = document.getElementById('foto');
  const preview = document.getElementById('photo-preview');
  if (photoInput && preview) {
    photoInput.addEventListener('change', () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) {
        preview.hidden = true;
        preview.removeAttribute('src');
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        window.alert('Das Foto darf höchstens 8 MB groß sein.');
        photoInput.value = '';
        preview.hidden = true;
        return;
      }
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.hidden = false;
      preview.onload = () => URL.revokeObjectURL(url);
    });
  }
})();
