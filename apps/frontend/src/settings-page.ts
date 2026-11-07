/**
 * settings.html: the metadata sources the search form offers, and where
 * maps are kept.
 */
import "@okmaps/ui-svelte/styles.css";
import { applyScheme, initialScheme, SettingsPage } from "@okmaps/ui-svelte";
import { mount } from "svelte";
import { registerServiceWorker } from "./offline.ts";
import { registerAppSources } from "./sources.ts";
import { appSettings } from "./store.ts";

registerAppSources();
applyScheme(initialScheme());
const target = document.getElementById("settings")!;
target.classList.add("okmaps");
// Back from a login that adding a store started (the start page finished it).
const params = new URLSearchParams(location.search);
const added = appSettings().store(params.get("added") ?? "");
const failed = params.get("failed");
const notice = added ? `${added.name} was added.` : failed ? `That store could not be used: ${failed}.` : "";
if (added || failed) history.replaceState(null, "", location.pathname);
mount(SettingsPage, { target, props: { settings: appSettings(), notice, noticeError: !!failed } });
registerServiceWorker();
