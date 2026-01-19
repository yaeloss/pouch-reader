import * as db from "./db"
import { IPartialTheme, loadTheme } from "@fluentui/react"
import locales from "./i18n/_locales"
import { ThemeSettings } from "../schema-types"
import intl from "react-intl-universal"
import { SourceTextDirection } from "./models/source"

let lightTheme: IPartialTheme = {
    defaultFontStyle: {
        fontFamily: '"Segoe UI", "Source Han Sans Regular", sans-serif',
    },
}
let darkTheme: IPartialTheme = {
    ...lightTheme,
    palette: {
        neutralLighterAlt: "#0a0a0a",
        neutralLighter: "#151515",
        neutralLight: "#1a1a1a",
        neutralQuaternaryAlt: "#1f1f1f",
        neutralQuaternary: "#252525",
        neutralTertiaryAlt: "#3a3a3a",
        neutralTertiary: "#c0c0c0",
        neutralSecondary: "#d0d0d0",
        neutralSecondaryAlt: "#e0e0e0",
        neutralPrimaryAlt: "#eeeeee",
        neutralPrimary: "#ffffff",
        neutralDark: "#f4f4f4",
        black: "#f8f8f8",
        white: "#0a0a0a",
        themePrimary: "#2563eb",
        themeLighterAlt: "#010408",
        themeLighter: "#05101f",
        themeLight: "#091e3b",
        themeTertiary: "#123c76",
        themeSecondary: "#1d59ab",
        themeDarkAlt: "#3b72ee",
        themeDark: "#5b8af1",
        themeDarker: "#89abf5",
        accent: "#60a5fa",
    },
}

export function setThemeDefaultFont(locale: string) {
    switch (locale) {
        case "zh-CN":
            lightTheme.defaultFontStyle.fontFamily =
                '"Segoe UI", "Source Han Sans SC Regular", "Microsoft YaHei", sans-serif'
            break
        case "zh-TW":
            lightTheme.defaultFontStyle.fontFamily =
                '"Segoe UI", "Source Han Sans TC Regular", "Microsoft JhengHei", sans-serif'
            break
        case "ja":
            lightTheme.defaultFontStyle.fontFamily =
                '"Segoe UI", "Source Han Sans JP Regular", "Yu Gothic UI", sans-serif'
            break
        case "ko":
            lightTheme.defaultFontStyle.fontFamily =
                '"Segoe UI", "Source Han Sans KR Regular", "Malgun Gothic", sans-serif'
            break
        default:
            lightTheme.defaultFontStyle.fontFamily =
                '"Segoe UI", "Source Han Sans Regular", sans-serif'
    }
    darkTheme.defaultFontStyle.fontFamily =
        lightTheme.defaultFontStyle.fontFamily
    applyThemeSettings()
}
export function setThemeSettings(theme: ThemeSettings) {
    window.settings.setThemeSettings(theme)
    applyThemeSettings()
}
export function getThemeSettings(): ThemeSettings {
    return window.settings.getThemeSettings()
}
export function applyThemeSettings() {
    loadTheme(window.settings.shouldUseDarkColors() ? darkTheme : lightTheme)
}
window.settings.addThemeUpdateListener(shouldDark => {
    loadTheme(shouldDark ? darkTheme : lightTheme)
})

export function getCurrentLocale() {
    let locale = window.settings.getCurrentLocale()
    if (locale in locales) return locale
    locale = locale.split("-")[0]
    return locale in locales ? locale : "en-US"
}

export async function exportAll() {
    const filters = [{ name: intl.get("app.frData"), extensions: ["frdata"] }]
    const write = await window.utils.showSaveDialog(
        filters,
        "*/Pouch_Backup.frdata"
    )
    if (write) {
        let output = window.settings.getAll()
        output["lovefield"] = {
            sources: await db.sourcesDB.select().from(db.sources).exec(),
            items: await db.itemsDB.select().from(db.items).exec(),
        }
        write(JSON.stringify(output), intl.get("settings.writeError"))
    }
}

export async function importAll() {
    const filters = [{ name: intl.get("app.frData"), extensions: ["frdata"] }]
    let data = await window.utils.showOpenDialog(filters)
    if (!data) return true
    let confirmed = await window.utils.showMessageBox(
        intl.get("app.restore"),
        intl.get("app.confirmImport"),
        intl.get("confirm"),
        intl.get("cancel"),
        true,
        "warning"
    )
    if (!confirmed) return true
    let configs = JSON.parse(data)
    await db.sourcesDB.delete().from(db.sources).exec()
    await db.itemsDB.delete().from(db.items).exec()
    if (configs.nedb) {
        let openRequest = window.indexedDB.open("NeDB")
        configs.useNeDB = true
        openRequest.onsuccess = () => {
            let db = openRequest.result
            let objectStore = db
                .transaction("nedbdata", "readwrite")
                .objectStore("nedbdata")
            let requests = Object.entries(configs.nedb).map(([key, value]) => {
                return objectStore.put(value, key)
            })
            let promises = requests.map(
                req =>
                    new Promise<void>((resolve, reject) => {
                        req.onsuccess = () => resolve()
                        req.onerror = () => reject()
                    })
            )
            Promise.all(promises).then(() => {
                delete configs.nedb
                window.settings.setAll(configs)
            })
        }
    } else {
        const sRows = configs.lovefield.sources.map(s => {
            s.lastFetched = new Date(s.lastFetched)
            if (!s.textDir) s.textDir = SourceTextDirection.LTR
            if (!s.hidden) s.hidden = false
            return db.sources.createRow(s)
        })
        const iRows = configs.lovefield.items.map(i => {
            i.date = new Date(i.date)
            i.fetchedDate = new Date(i.fetchedDate)
            return db.items.createRow(i)
        })
        await db.sourcesDB.insert().into(db.sources).values(sRows).exec()
        await db.itemsDB.insert().into(db.items).values(iRows).exec()
        delete configs.lovefield
        window.settings.setAll(configs)
    }
    return false
}
