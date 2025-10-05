// Internationalization utility for Three.js Earth project
import enTranslations from './locales/en.json'
import esTranslations from './locales/es.json'
import frTranslations from './locales/fr.json'
import deTranslations from './locales/de.json'
import zhTranslations from './locales/zh.json'
import ruTranslations from './locales/ru.json'

class I18n {
  constructor() {
    this.currentLanguage = localStorage.getItem('earth-app-language') || 'en';
    this.translations = {
      'en': enTranslations,
      'es': esTranslations,
      'fr': frTranslations,
      'de': deTranslations,
      'zh': zhTranslations,
      'ru': ruTranslations
    };
    this.fallbackLanguage = 'en';
  }

  // Initialize the i18n system
  async init() {
    // Apply translations to the page
    this.applyTranslations();
    
    // Update language selector
    this.updateLanguageSelector();
  }

  // Get translation for a key
  t(key, params = {}) {
    let translation = this.getTranslation(key, this.currentLanguage) || 
                     this.getTranslation(key, this.fallbackLanguage) || 
                     key;

    // Replace parameters in translation
    Object.keys(params).forEach(param => {
      translation = translation.replace(`{{${param}}}`, params[param]);
    });

    return translation;
  }

  // Get nested translation
  getTranslation(key, language) {
    if (!this.translations[language]) return null;
    
    const keys = key.split('.');
    let result = this.translations[language];
    
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return null;
      }
    }
    
    return result;
  }

  // Change language
  async changeLanguage(language) {
    if (language === this.currentLanguage) return;
    
    if (this.translations[language]) {
      this.currentLanguage = language;
      localStorage.setItem('earth-app-language', language);
      this.applyTranslations();
      this.updateLanguageSelector();
      
      // Trigger custom event for language change
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
    }
  }

  // Apply translations to all elements with data-i18n attribute
  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.t(key);
      
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        if (element.type === 'submit' || element.type === 'button') {
          element.value = translation;
        } else {
          element.placeholder = translation;
        }
      } else {
        element.textContent = translation;
      }
    });

    // Apply translations to elements with data-i18n-html attribute (for HTML content)
    document.querySelectorAll('[data-i18n-html]').forEach(element => {
      const key = element.getAttribute('data-i18n-html');
      const translation = this.t(key);
      element.innerHTML = translation;
    });

    // Update document title
    const titleKey = document.querySelector('title').getAttribute('data-i18n');
    if (titleKey) {
      document.title = this.t(titleKey);
    }
  }

  // Update language selector UI
  updateLanguageSelector() {
    const selector = document.getElementById('language-selector');
    if (selector) {
      selector.value = this.currentLanguage;
    }
  }

  // Get available languages
  getAvailableLanguages() {
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' }
    ];
  }

  // Get current language
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  // Translate city/location name if available
  translateLocation(locationName) {
    if (!locationName) return locationName;
    
    // Convert location name to key format (lowercase, replace spaces with underscores)
    const locationKey = locationName.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w_]/g, '');
    
    // Try to find translation in locations
    const translated = this.t(`locations.${locationKey}`);
    
    // If translation is the same as key, return original name
    return translated === `locations.${locationKey}` ? locationName : translated;
  }

  // Format coordinates based on locale
  formatCoordinates(lat, lon, precision = 4) {
    const latFormatted = lat.toFixed(precision);
    const lonFormatted = lon.toFixed(precision);
    
    // Use localized coordinate format
    return this.t('coordinates.format', { 
      lat: latFormatted, 
      lon: lonFormatted 
    });
  }
}

// Create global instance
window.i18n = new I18n();

export default window.i18n;