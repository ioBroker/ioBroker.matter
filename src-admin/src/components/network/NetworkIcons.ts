/**
 * NetworkIcons - SVG data-URL generators for network graph nodes
 *
 * vis-network renders `shape: 'image'` nodes from a data URL. We compose icons from `@mdi/js`
 * glyph paths (CSP-safe, no external assets) so device-type, Thread role, Border Router and
 * unknown-device nodes render distinctly. Device-type → glyph mapping mirrors matterjs-server.
 */

import {
    mdiAccessPoint,
    mdiAirConditioner,
    mdiAirFilter,
    mdiAirPurifier,
    mdiBell,
    mdiBlindsHorizontal,
    mdiBrightnessPercent,
    mdiCamera,
    mdiCast,
    mdiCctv,
    mdiChip,
    mdiCircleMedium,
    mdiCrown,
    mdiDishwasher,
    mdiDoorbell,
    mdiDoorbellVideo,
    mdiDoorOpen,
    mdiEvStation,
    mdiFan,
    mdiFridge,
    mdiGauge,
    mdiHeatPump,
    mdiHelp,
    mdiHome,
    mdiLeaf,
    mdiLightbulb,
    mdiLock,
    mdiMeterElectric,
    mdiMicrowave,
    mdiMotionSensor,
    mdiPowerPlug,
    mdiPump,
    mdiRemote,
    mdiRobotVacuum,
    mdiRouter,
    mdiRouterWireless,
    mdiSleep,
    mdiSmokeDetector,
    mdiSnowflakeAlert,
    mdiSolarPower,
    mdiSpeaker,
    mdiSprinkler,
    mdiStar,
    mdiStove,
    mdiSwapHorizontal,
    mdiTelevision,
    mdiThermometer,
    mdiToggleSwitch,
    mdiTumbleDryer,
    mdiWashingMachine,
    mdiWater,
    mdiWaterBoiler,
    mdiWaterPercent,
    mdiWeatherRainy,
    mdiWifi,
} from '@mdi/js';

// Node base colors
const COLOR_SELECTED = '#1976D2';
const COLOR_OFFLINE = '#D32F2F';
const COLOR_DEFAULT = '#607D8B';
const COLOR_BR_PRIMARY = '#03A9F4';
const COLOR_UNKNOWN = '#FF9800';

// Thread role colors (base disc + matching badge)
const COLOR_ROLE_LEADER = '#F9A825';
const COLOR_ROLE_ROUTER = '#1E88E5';
const COLOR_ROLE_REED = '#039BE5';
const COLOR_ROLE_ENDDEVICE = '#4CAF50';
const COLOR_PRIMARY_BBR = '#00897B';

/** Matter device-type ids (Matter Device Library 1.5). */
const DeviceTypes = {
    ROOT_NODE: 0x0016,
    ELECTRICAL_SENSOR: 0x0510,
    DEVICE_ENERGY_MANAGEMENT: 0x050d,

    ON_OFF_LIGHT: 0x0100,
    DIMMABLE_LIGHT: 0x0101,
    COLOR_TEMPERATURE_LIGHT: 0x010c,
    EXTENDED_COLOR_LIGHT: 0x010d,

    ON_OFF_PLUG: 0x010a,
    DIMMABLE_PLUG: 0x010b,
    MOUNTED_ON_OFF_CONTROL: 0x010f,
    MOUNTED_DIMMABLE_LOAD_CONTROL: 0x0110,
    PUMP: 0x0303,
    WATER_VALVE: 0x0042,
    IRRIGATION_SYSTEM: 0x0040,

    ON_OFF_SWITCH: 0x0103,
    DIMMER_SWITCH: 0x0104,
    COLOR_DIMMER_SWITCH: 0x0105,
    CONTROL_BRIDGE: 0x0840,
    PUMP_CONTROLLER: 0x0304,
    GENERIC_SWITCH: 0x000f,

    CONTACT_SENSOR: 0x0015,
    LIGHT_SENSOR: 0x0106,
    OCCUPANCY_SENSOR: 0x0107,
    TEMPERATURE_SENSOR: 0x0302,
    PRESSURE_SENSOR: 0x0305,
    FLOW_SENSOR: 0x0306,
    HUMIDITY_SENSOR: 0x0307,
    ON_OFF_SENSOR: 0x0850,
    SMOKE_CO_ALARM: 0x0076,
    AIR_QUALITY_SENSOR: 0x002c,
    WATER_FREEZE_DETECTOR: 0x0041,
    WATER_LEAK_DETECTOR: 0x0043,
    RAIN_SENSOR: 0x0044,
    SOIL_SENSOR: 0x0045,

    DOOR_LOCK: 0x000a,
    DOOR_LOCK_CONTROLLER: 0x000b,
    WINDOW_COVERING: 0x0202,
    WINDOW_COVERING_CONTROLLER: 0x0203,
    CLOSURE: 0x0230,
    CLOSURE_PANEL: 0x0231,
    CLOSURE_CONTROLLER: 0x023e,

    THERMOSTAT: 0x0301,
    FAN: 0x002b,
    AIR_PURIFIER: 0x002d,
    THERMOSTAT_CONTROLLER: 0x030a,
    HEAT_PUMP: 0x0309,
    ROOM_AIR_CONDITIONER: 0x0072,

    SPEAKER: 0x0022,
    CASTING_VIDEO_PLAYER: 0x0023,
    CONTENT_APP: 0x0024,
    BASIC_VIDEO_PLAYER: 0x0028,
    CASTING_VIDEO_CLIENT: 0x0029,
    VIDEO_REMOTE_CONTROL: 0x002a,

    AGGREGATOR: 0x000e,

    REFRIGERATOR: 0x0070,
    TEMPERATURE_CONTROLLED_CABINET: 0x0071,
    LAUNDRY_WASHER: 0x0073,
    ROBOTIC_VACUUM_CLEANER: 0x0074,
    DISHWASHER: 0x0075,
    COOK_SURFACE: 0x0077,
    COOKTOP: 0x0078,
    MICROWAVE_OVEN: 0x0079,
    EXTRACTOR_HOOD: 0x007a,
    OVEN: 0x007b,
    LAUNDRY_DRYER: 0x007c,

    EVSE: 0x050c,
    WATER_HEATER: 0x050f,
    SOLAR_POWER: 0x0017,
    BATTERY_STORAGE: 0x0018,

    NETWORK_INFRASTRUCTURE_MANAGER: 0x0090,
    THREAD_BORDER_ROUTER: 0x0091,

    CAMERA: 0x0142,
    SNAPSHOT_CAMERA: 0x0145,
    VIDEO_DOORBELL: 0x0143,
    AUDIO_DOORBELL: 0x0141,
    FLOODLIGHT_CAMERA: 0x0144,
    DOORBELL: 0x0148,
    CHIME: 0x0146,
    CAMERA_CONTROLLER: 0x0147,
    INTERCOM: 0x0140,
} as const;

/** Maps device-type ids to MDI glyph paths (mirrors matterjs-server deviceTypeToIcon). */
const deviceTypeToIcon: Record<number, string> = {
    [DeviceTypes.ROOT_NODE]: mdiHome,
    [DeviceTypes.ELECTRICAL_SENSOR]: mdiMeterElectric,
    [DeviceTypes.DEVICE_ENERGY_MANAGEMENT]: mdiMeterElectric,

    [DeviceTypes.ON_OFF_LIGHT]: mdiLightbulb,
    [DeviceTypes.DIMMABLE_LIGHT]: mdiLightbulb,
    [DeviceTypes.COLOR_TEMPERATURE_LIGHT]: mdiLightbulb,
    [DeviceTypes.EXTENDED_COLOR_LIGHT]: mdiLightbulb,

    [DeviceTypes.ON_OFF_PLUG]: mdiPowerPlug,
    [DeviceTypes.DIMMABLE_PLUG]: mdiPowerPlug,
    [DeviceTypes.MOUNTED_ON_OFF_CONTROL]: mdiPowerPlug,
    [DeviceTypes.MOUNTED_DIMMABLE_LOAD_CONTROL]: mdiPowerPlug,
    [DeviceTypes.PUMP]: mdiPump,
    [DeviceTypes.WATER_VALVE]: mdiWater,
    [DeviceTypes.IRRIGATION_SYSTEM]: mdiSprinkler,

    [DeviceTypes.ON_OFF_SWITCH]: mdiToggleSwitch,
    [DeviceTypes.DIMMER_SWITCH]: mdiToggleSwitch,
    [DeviceTypes.COLOR_DIMMER_SWITCH]: mdiToggleSwitch,
    [DeviceTypes.CONTROL_BRIDGE]: mdiRouter,
    [DeviceTypes.PUMP_CONTROLLER]: mdiPump,
    [DeviceTypes.GENERIC_SWITCH]: mdiToggleSwitch,

    [DeviceTypes.CONTACT_SENSOR]: mdiDoorOpen,
    [DeviceTypes.LIGHT_SENSOR]: mdiBrightnessPercent,
    [DeviceTypes.OCCUPANCY_SENSOR]: mdiMotionSensor,
    [DeviceTypes.TEMPERATURE_SENSOR]: mdiThermometer,
    [DeviceTypes.PRESSURE_SENSOR]: mdiGauge,
    [DeviceTypes.FLOW_SENSOR]: mdiWater,
    [DeviceTypes.HUMIDITY_SENSOR]: mdiWaterPercent,
    [DeviceTypes.ON_OFF_SENSOR]: mdiMotionSensor,
    [DeviceTypes.SMOKE_CO_ALARM]: mdiSmokeDetector,
    [DeviceTypes.AIR_QUALITY_SENSOR]: mdiAirFilter,
    [DeviceTypes.WATER_FREEZE_DETECTOR]: mdiSnowflakeAlert,
    [DeviceTypes.WATER_LEAK_DETECTOR]: mdiWater,
    [DeviceTypes.RAIN_SENSOR]: mdiWeatherRainy,
    [DeviceTypes.SOIL_SENSOR]: mdiLeaf,

    [DeviceTypes.DOOR_LOCK]: mdiLock,
    [DeviceTypes.DOOR_LOCK_CONTROLLER]: mdiLock,
    [DeviceTypes.WINDOW_COVERING]: mdiBlindsHorizontal,
    [DeviceTypes.WINDOW_COVERING_CONTROLLER]: mdiBlindsHorizontal,
    [DeviceTypes.CLOSURE]: mdiDoorOpen,
    [DeviceTypes.CLOSURE_PANEL]: mdiDoorOpen,
    [DeviceTypes.CLOSURE_CONTROLLER]: mdiDoorOpen,

    [DeviceTypes.THERMOSTAT]: mdiThermometer,
    [DeviceTypes.FAN]: mdiFan,
    [DeviceTypes.AIR_PURIFIER]: mdiAirPurifier,
    [DeviceTypes.THERMOSTAT_CONTROLLER]: mdiThermometer,
    [DeviceTypes.HEAT_PUMP]: mdiHeatPump,
    [DeviceTypes.ROOM_AIR_CONDITIONER]: mdiAirConditioner,

    [DeviceTypes.SPEAKER]: mdiSpeaker,
    [DeviceTypes.CASTING_VIDEO_PLAYER]: mdiTelevision,
    [DeviceTypes.CONTENT_APP]: mdiTelevision,
    [DeviceTypes.BASIC_VIDEO_PLAYER]: mdiTelevision,
    [DeviceTypes.CASTING_VIDEO_CLIENT]: mdiCast,
    [DeviceTypes.VIDEO_REMOTE_CONTROL]: mdiRemote,

    [DeviceTypes.AGGREGATOR]: mdiRouter,

    [DeviceTypes.REFRIGERATOR]: mdiFridge,
    [DeviceTypes.TEMPERATURE_CONTROLLED_CABINET]: mdiFridge,
    [DeviceTypes.LAUNDRY_WASHER]: mdiWashingMachine,
    [DeviceTypes.ROBOTIC_VACUUM_CLEANER]: mdiRobotVacuum,
    [DeviceTypes.DISHWASHER]: mdiDishwasher,
    [DeviceTypes.COOK_SURFACE]: mdiStove,
    [DeviceTypes.COOKTOP]: mdiStove,
    [DeviceTypes.MICROWAVE_OVEN]: mdiMicrowave,
    [DeviceTypes.EXTRACTOR_HOOD]: mdiFan,
    [DeviceTypes.OVEN]: mdiStove,
    [DeviceTypes.LAUNDRY_DRYER]: mdiTumbleDryer,

    [DeviceTypes.EVSE]: mdiEvStation,
    [DeviceTypes.WATER_HEATER]: mdiWaterBoiler,
    [DeviceTypes.SOLAR_POWER]: mdiSolarPower,
    [DeviceTypes.BATTERY_STORAGE]: mdiMeterElectric,

    [DeviceTypes.NETWORK_INFRASTRUCTURE_MANAGER]: mdiRouter,
    [DeviceTypes.THREAD_BORDER_ROUTER]: mdiAccessPoint,

    [DeviceTypes.CAMERA]: mdiCamera,
    [DeviceTypes.SNAPSHOT_CAMERA]: mdiCamera,
    [DeviceTypes.VIDEO_DOORBELL]: mdiDoorbellVideo,
    [DeviceTypes.AUDIO_DOORBELL]: mdiDoorbell,
    [DeviceTypes.FLOODLIGHT_CAMERA]: mdiCctv,
    [DeviceTypes.DOORBELL]: mdiDoorbell,
    [DeviceTypes.CHIME]: mdiBell,
    [DeviceTypes.CAMERA_CONTROLLER]: mdiCamera,
    [DeviceTypes.INTERCOM]: mdiDoorbell,
};

/** MDI glyph path for a Matter device-type id; generic chip glyph for unknown/undefined. */
export function getDeviceTypeIconPath(deviceType: number | undefined): string {
    if (deviceType === undefined) {
        return mdiChip;
    }
    return deviceTypeToIcon[deviceType] ?? mdiChip;
}

interface RoleBadge {
    iconPath: string;
    color: string;
}

/**
 * Corner badge marking a node's Thread RoutingRole (attr 0/53/1), overlaid on the device icon.
 * Leader is the high-signal exception (crown); routers and end devices use lower-key glyphs.
 * Unassigned/Unspecified/unknown roles get no badge.
 */
const THREAD_ROLE_BADGES: Record<number, RoleBadge> = {
    2: { iconPath: mdiSleep, color: COLOR_ROLE_ENDDEVICE }, // Sleepy End Device
    3: { iconPath: mdiCircleMedium, color: COLOR_ROLE_ENDDEVICE }, // End Device
    4: { iconPath: mdiCircleMedium, color: COLOR_ROLE_REED }, // REED
    5: { iconPath: mdiSwapHorizontal, color: COLOR_ROLE_ROUTER }, // Router
    6: { iconPath: mdiCrown, color: COLOR_ROLE_LEADER }, // Leader
};

function roleColor(role: number | null | undefined): string {
    switch (role) {
        case 6:
            return COLOR_ROLE_LEADER;
        case 5:
            return COLOR_ROLE_ROUTER;
        case 4:
            return COLOR_ROLE_REED;
        case 3:
        case 2:
            return COLOR_ROLE_ENDDEVICE;
        default:
            return COLOR_DEFAULT;
    }
}

/**
 * Builds an SVG data URL: a white disc bordered in `color` with `iconPath` centered,
 * and an optional top-right corner badge (white glyph on a colored disc).
 */
function createIconDataUrl(
    iconPath: string,
    color: string,
    size = 48,
    badge?: { iconPath: string; color: string },
): string {
    const badgeMarkup =
        badge !== undefined
            ? `<circle cx="18" cy="6" r="4" fill="${badge.color}"/><path d="${badge.iconPath}" fill="white" transform="translate(14.64,2.64) scale(0.28)"/>`
            : '';
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">` +
        `<circle cx="12" cy="12" r="11" fill="white" stroke="${color}" stroke-width="1"/>` +
        `<path d="${iconPath}" fill="${color}" transform="scale(0.6) translate(8,8)"/>` +
        `${badgeMarkup}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Icon for a commissioned device: the device-type glyph colored by Thread role (or the default
 * colour for non-Thread nodes), with the Thread role badge overlay (crown/swap/circle/sleep).
 */
export function createNodeIconDataUrl(
    deviceType: number | undefined,
    role: number | null | undefined,
    isOffline = false,
    isSelected = false,
): string {
    let color: string;
    if (isSelected) {
        color = COLOR_SELECTED;
    } else if (isOffline) {
        color = COLOR_OFFLINE;
    } else {
        color = roleColor(role);
    }
    const badge = role != null ? THREAD_ROLE_BADGES[role] : undefined;
    return createIconDataUrl(getDeviceTypeIconPath(deviceType), color, 48, badge);
}

/**
 * Icon for an mDNS-discovered Thread Border Router. Mesh role (crown for leader, router-wireless
 * otherwise) is the central glyph; a corner star marks the primary Backbone Border Router.
 */
export function createBorderRouterIconDataUrl(isSelected = false, isLeader = false, isPrimaryBbr = false): string {
    const glyph = isLeader ? mdiCrown : mdiRouterWireless;
    const color = isSelected ? COLOR_SELECTED : isLeader ? COLOR_ROLE_LEADER : COLOR_BR_PRIMARY;
    const badge = isPrimaryBbr ? { iconPath: mdiStar, color: COLOR_PRIMARY_BBR } : undefined;
    return createIconDataUrl(glyph, color, 48, badge);
}

/** Icon for an unidentified external Thread neighbor (question mark, or access-point if router-like). */
export function createUnknownDeviceIconDataUrl(isRouter = false, isSelected = false): string {
    const iconPath = isRouter ? mdiAccessPoint : mdiHelp;
    const color = isSelected ? COLOR_SELECTED : COLOR_UNKNOWN;
    return createIconDataUrl(iconPath, color, 48);
}

/** Icon for a WiFi access point. */
export function createWiFiApIconDataUrl(isSelected = false): string {
    return createIconDataUrl(mdiWifi, isSelected ? COLOR_SELECTED : COLOR_UNKNOWN, 48);
}
