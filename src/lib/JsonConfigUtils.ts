import type { ConfigItemAny, ConfigItemPanel, JsonFormSchema } from '@iobroker/dm-utils';
import { decamelize } from './utils';

export type StructuredJsonFormData = Record<string, Record<string, unknown>>;

/**
 * Convert a generic object data model into JSON Config data forms
 * Keys are expected to be camel-case strings and will be used as field name too  in de-camel-cased form
 * If needed for uniqueness "__" can be used as splitter and anything after this is used as field name
 * "__header__*" entries are converted into a headline with the value as text
 * "__divider__*" entries are converted into a divider
 * "__text__*" entries are converted into a static text field
 * "__iobstate__*" entries are converted into a state field with the value as label
 * The logic expects a two level object structure. By default, it returns a tabs structure. If only one key is used on
 * first level only one panel is returned.
 */
export function convertDataToJsonConfig(data: StructuredJsonFormData): JsonFormSchema {
    const items: Record<string, ConfigItemPanel> = {};

    let panelCount = 0;
    for (const tab in data) {
        panelCount++;
        const tabItems: Record<string, ConfigItemAny> = {};

        for (const tabItem in data[tab]) {
            const flatKey = `${tab}_${tabItem}`;
            if (tabItem.startsWith('__header__')) {
                tabItems[flatKey] = {
                    type: 'header',
                    text: String(data[tab][tabItem]),
                    noTranslation: true,
                };
                continue;
            }
            if (tabItem.startsWith('__text__')) {
                tabItems[flatKey] = {
                    type: 'staticText',
                    text: String(data[tab][tabItem]),
                };
                continue;
            }
            if (tabItem.startsWith('__smalltext__')) {
                tabItems[flatKey] = {
                    type: 'staticText',
                    text: String(data[tab][tabItem]),
                    style: { fontSize: 10, fontStyle: 'italic', marginTop: -8 },
                };
                continue;
            }
            if (tabItem.startsWith('__divider__')) {
                tabItems[flatKey] = {
                    type: 'divider',
                };
                continue;
            }
            if (tabItem.startsWith('__iobstate__')) {
                if (data[tab][tabItem] && typeof data[tab][tabItem] === 'object') {
                    tabItems[flatKey] = {
                        type: 'state',
                        foreign: true,
                        label: tabItem.substring(12),
                        addColon: true,
                        controlDelay: 500,
                        oid: '', // oid will be overwritten by data[key][subKey]
                        ...data[tab][tabItem],
                    };
                }
                continue;
            }

            if (data[tab][tabItem] === undefined) {
                continue;
            }

            const subKeyShortenerIndex = tabItem.indexOf('__');
            const subKeyLabel = decamelize(
                subKeyShortenerIndex !== -1 ? tabItem.substring(subKeyShortenerIndex + 2) : tabItem,
            );
            tabItems[flatKey] = {
                type: 'staticInfo',
                label: subKeyLabel,
                newLine: true,
                noTranslation: true,
                data: data[tab][tabItem] as number | string | boolean,
            };
        }

        items[`_tab_${tab}`] = {
            type: 'panel',
            label: decamelize(tab),
            noTranslation: true,
            items: tabItems,
            style: {
                minWidth: 200,
            },
        };
    }

    if (panelCount === 1) {
        return Object.values(items)[0];
    }

    return {
        type: 'tabs',
        items,
    };
}
