// Dynamic Translation System with API Integration
// Reduces hardcoded translations by using translation services

class DynamicI18n {
  constructor() {
    this.currentLanguage = localStorage.getItem('earth-app-language') || 'en';
    this.fallbackLanguage = 'en';
    this.cache = new Map(); // Translation cache
    this.baseTranslations = this.getBaseTranslations(); // Minimal core translations
    this.translationApis = this.getTranslationApis();
  }

  // Minimal base translations for core UI - only essential keys
  getBaseTranslations() {
    return {
      en: {
        loading: { title: "Loading Asteroid Atlas...", progress: "Loading..." },
        ui: { 
          language: "Language",
          loading: "Loading",
          error: "Error",
          retry: "Retry"
        },
        navigation: {
          latitude: "Latitude",
          longitude: "Longitude", 
          go: "Go",
          myLocation: "My Location"
        }
      }
    };
  }

  // Available translation APIs (free tier services)
  getTranslationApis() {
    return [
      {
        name: 'LibreTranslate',
        url: 'https://libretranslate.de/translate',
        free: true,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        format: (text, targetLang) => ({
          q: text,
          source: 'en',
          target: targetLang,
          format: 'text'
        })
      },
      {
        name: 'MyMemory',
        url: 'https://api.mymemory.translated.net/get',
        free: true,
        method: 'GET',
        format: (text, targetLang) => `?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`
      }
    ];
  }

  // Initialize the dynamic translation system
  async init() {
    await this.loadCoreTranslations();
    this.applyTranslations();
    this.updateLanguageSelector();
  }

  // Load core translations dynamically
  async loadCoreTranslations() {
    if (this.currentLanguage === 'en') return;

    const coreKeys = this.extractAllKeys(this.baseTranslations.en);
    await this.translateKeys(coreKeys, this.currentLanguage);
  }

  // Extract all translation keys from nested object
  extractAllKeys(obj, prefix = '') {
    let keys = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null) {
        keys = keys.concat(this.extractAllKeys(value, fullKey));
      } else {
        keys.push({ key: fullKey, text: value });
      }
    }
    return keys;
  }

  // Translate multiple keys at once
  async translateKeys(keyObjects, targetLang) {
    const textsToTranslate = keyObjects.map(ko => ko.text);
    
    try {
      const translations = await this.translateBatch(textsToTranslate, targetLang);
      
      // Cache the translations
      keyObjects.forEach((keyObj, index) => {
        if (translations[index]) {
          this.setTranslation(keyObj.key, targetLang, translations[index]);
        }
      });
    } catch (error) {
      console.warn('Batch translation failed, falling back to individual translations:', error);
      
      // Fallback: translate individually
      for (const keyObj of keyObjects) {
        try {
          const translation = await this.translateText(keyObj.text, targetLang);
          if (translation) {
            this.setTranslation(keyObj.key, targetLang, translation);
          }
        } catch (e) {
          console.warn(`Failed to translate "${keyObj.text}":`, e);
        }
      }
    }
  }

  // Translate a batch of texts
  async translateBatch(texts, targetLang) {
    const results = [];
    
    for (const text of texts) {
      try {
        const translation = await this.translateText(text, targetLang);
        results.push(translation || text);
      } catch (error) {
        results.push(text); // Fallback to original text
      }
    }
    
    return results;
  }

  // Translate single text using available APIs
  async translateText(text, targetLang) {
    // Check cache first
    const cacheKey = `${text}:${targetLang}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Try each translation API
    for (const api of this.translationApis) {
      try {
        const translation = await this.callTranslationApi(api, text, targetLang);
        if (translation && translation !== text) {
          this.cache.set(cacheKey, translation);
          return translation;
        }
      } catch (error) {
        console.warn(`Translation API ${api.name} failed:`, error);
        continue;
      }
    }

    return null; // No translation available
  }

  // Call a specific translation API
  async callTranslationApi(api, text, targetLang) {
    try {
      let url = api.url;
      let options = {
        method: api.method || 'GET',
        headers: api.headers || {}
      };

      if (api.method === 'POST') {
        options.body = JSON.stringify(api.format(text, targetLang));
      } else {
        url += api.format(text, targetLang);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Handle different API response formats
      if (api.name === 'LibreTranslate') {
        return data.translatedText;
      } else if (api.name === 'MyMemory') {
        return data.responseData?.translatedText;
      }
      
      return null;
    } catch (error) {
      throw new Error(`${api.name} API error: ${error.message}`);
    }
  }

  // Get translation with automatic fallback
  async t(key, params = {}) {
    let translation = await this.getTranslation(key, this.currentLanguage);
    
    if (!translation) {
      translation = this.getTranslation(key, this.fallbackLanguage);
    }
    
    if (!translation) {
      // Try to translate dynamically if it's a simple key
      const baseText = this.getBaseText(key);
      if (baseText && this.currentLanguage !== 'en') {
        translation = await this.translateText(baseText, this.currentLanguage);
      }
    }

    if (!translation) {
      translation = key; // Ultimate fallback
    }

    // Replace parameters
    Object.keys(params).forEach(param => {
      translation = translation.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
    });

    return translation;
  }

  // Get base English text for a key
  getBaseText(key) {
    const keys = key.split('.');
    let result = this.baseTranslations.en;
    
    for (const k of keys) {
      if (result && typeof result === 'object') {
        result = result[k];
      } else {
        return null;
      }
    }
    
    return typeof result === 'string' ? result : null;
  }

  // Get translation from base translations or cache
  getTranslation(key, language) {
    // Check base translations first
    const keys = key.split('.');
    let result = this.baseTranslations[language];
    
    if (result) {
      for (const k of keys) {
        if (result && typeof result === 'object') {
          result = result[k];
        } else {
          result = null;
          break;
        }
      }
      
      if (typeof result === 'string') {
        return result;
      }
    }

    // Check dynamic translations cache
    const cacheKey = `${key}:${language}`;
    return this.cache.get(cacheKey);
  }

  // Set translation in cache
  setTranslation(key, language, value) {
    const cacheKey = `${key}:${language}`;
    this.cache.set(cacheKey, value);
  }

  // Change language with dynamic loading
  async changeLanguage(newLanguage) {
    this.currentLanguage = newLanguage;
    localStorage.setItem('earth-app-language', newLanguage);
    
    // Load translations for new language
    await this.loadCoreTranslations();
    
    // Apply to UI
    this.applyTranslations();
    this.updateLanguageSelector();
  }

  // Apply translations to DOM elements
  applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    
    elements.forEach(async (element) => {
      const key = element.getAttribute('data-i18n');
      if (key) {
        const translation = await this.t(key);
        
        if (element.tagName.toLowerCase() === 'input' && element.type === 'text') {
          element.placeholder = translation;
        } else {
          element.textContent = translation;
        }
      }
    });

    // Update document title
    const titleElement = document.querySelector('title[data-i18n]');
    if (titleElement) {
      const titleKey = titleElement.getAttribute('data-i18n');
      this.t(titleKey).then(translation => {
        document.title = translation;
      });
    }
  }

  // Update language selector
  updateLanguageSelector() {
    const selector = document.getElementById('language-selector');
    if (selector) {
      selector.value = this.currentLanguage;
    }
  }

  // Get available languages (expanded list)
  getAvailableLanguages() {
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' }
    ];
  }

  // Translate location names dynamically
  async translateLocation(locationName) {
    if (!locationName || this.currentLanguage === 'en') {
      return locationName;
    }

    try {
      const translation = await this.translateText(locationName, this.currentLanguage);
      return translation || locationName;
    } catch (error) {
      console.warn('Failed to translate location:', error);
      return locationName;
    }
  }

  // Clear translation cache
  clearCache() {
    this.cache.clear();
  }

  // Export translations for debugging
  exportCache() {
    const cacheObj = {};
    for (const [key, value] of this.cache.entries()) {
      cacheObj[key] = value;
    }
    return cacheObj;
  }
}

// Create global instance
const dynamicI18n = new DynamicI18n();
window.i18n = dynamicI18n;

export default dynamicI18n;