import de from './i18n/de.json';
import en from './i18n/en.json';
import es from './i18n/es.json';
import fr from './i18n/fr.json';
import it from './i18n/it.json';
import nl from './i18n/nl.json';
import pl from './i18n/pl.json';
import pt from './i18n/pt.json';
import ru from './i18n/ru.json';
import uk from './i18n/uk.json';
import zhCN from './i18n/zh-cn.json';

const words: Record<string, Record<ioBroker.Languages, string>> = {};

function init(): void {
    const langs: Record<ioBroker.Languages, Record<string, string>> = {
        en,
        de,
        it,
        fr,
        es,
        nl,
        pt,
        pl,
        ru,
        uk,
        'zh-cn': zhCN,
    };

    Object.keys(langs).forEach(lang => {
        const lWords: Record<string, string> = langs[lang as ioBroker.Languages] as Record<string, string>;
        Object.keys(lWords).forEach(word => {
            if (!words[word]) {
                words[word] = {} as Record<ioBroker.Languages, string>;
            }
            words[word][lang as ioBroker.Languages] = langs[lang as ioBroker.Languages][word];
        });
    });
}

init();

export function t(word: string, lang?: ioBroker.Languages): ioBroker.StringOrTranslated {
    if (!lang) {
        return words[word] || word;
    }

    if (words[word]) {
        return words[word][lang] || words[word].en || word;
    }
    return word;
}

export function getText(word: ioBroker.StringOrTranslated, lang: ioBroker.Languages): string {
    if (typeof word === 'string') {
        return word;
    }
    return word[lang] || word.en;
}
