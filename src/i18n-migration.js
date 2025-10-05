// Migration helper to transition from static i18n to dynamic i18n
// This script helps import existing translations into the dynamic system

import dynamicI18n from './dynamic-i18n.js';

class I18nMigration {
  constructor() {
    this.staticTranslations = {};
  }

  // Load existing static translations if they exist
  async loadStaticTranslations() {
    const languages = ['en', 'es', 'fr', 'de', 'zh'];
    
    for (const lang of languages) {
      try {
        const module = await import(`./locales/${lang}.json`);
        this.staticTranslations[lang] = module.default;
        console.log(`Loaded static translations for ${lang}`);
      } catch (error) {
        console.log(`No static translations found for ${lang} - will use dynamic translation`);
      }
    }
  }

  // Merge static translations into dynamic system
  mergeIntoCache() {
    for (const [language, translations] of Object.entries(this.staticTranslations)) {
      this.mergeTranslationsRecursive(translations, language);
    }
  }

  // Recursively merge nested translation objects
  mergeTranslationsRecursive(obj, language, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null) {
        this.mergeTranslationsRecursive(value, language, fullKey);
      } else if (typeof value === 'string') {
        dynamicI18n.setTranslation(fullKey, language, value);
      }
    }
  }

  // Run the migration
  async migrate() {
    console.log('Starting i18n migration...');
    
    await this.loadStaticTranslations();
    this.mergeIntoCache();
    
    console.log('Migration completed. Cache contents:', dynamicI18n.exportCache());
    console.log('Dynamic i18n system is ready with merged translations.');
  }
}

// Create and export migration instance
const migration = new I18nMigration();

// Auto-run migration when imported
migration.migrate();

export default migration;