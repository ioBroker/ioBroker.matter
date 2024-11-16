![Logo](admin/matter.png)
# ioBroker Matter Adapter

![Number of Installations](http://iobroker.live/badges/matter-installed.svg)
![Number of Installations](http://iobroker.live/badges/matter-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.matter.svg)](https://www.npmjs.com/package/iobroker.matter)

![Test and Release](https://github.com/ioBroker/ioBroker.matter/workflows/Test%20and%20Release/badge.svg)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/matter/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)
[![Downloads](https://img.shields.io/npm/dm/iobroker.matter.svg)](https://www.npmjs.com/package/iobroker.matter)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.


## Description
TODO

## Troubleshooting
* On Linux especially see https://github.com/project-chip/matter.js/blob/main/docs/TROUBLESHOOTING.md

## Supported devices

### Supported ioBroker device types

| ioBroker Device Type | Mapped to Matter Device Type |
|----------------------|------------------------------|
| Dimmer               | Dimmable Light               |
| Door                 | Contact Sensor               |
| Flood Alarm          | Water Leak Sensor            |
| Humidity             | Humidity Sensor              |
| Light                | OnOff Light                  |
| Lock                 | Door Lock                    |
| Motion               | Occupancy Sensor             |
| Socket               | OnOff PlugIn                 |
| Temperature          | Temperature Sensor           |
| Window               | Contact Sensor               |

... more to come

### Supported Matter device types

| Matter Device Type  | Mapped to ioBroker Device Type |
|---------------------|--------------------------------|
| Dimmable Light      | Dimmer                         |
| Dimmable PlugInUnit | Dimmer                         |
| Contact Sensor      | Window                         |
| Energy Sensor       | Light with only energy states  |
| Humidity Sensor     | Humidity                       |
| OnOff Light         | Light                          |
| Door Lock           | Lock                           |
| Occupancy Sensor    | Motion                         |
| OnOff PlugIn Unit   | Socket                         |
| Temperature Sensor  | Temperature                    |
| Water Leak Sensor   | Flood Alarm                    |

... more to come

## ToDo



<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

## Changelog
### **WORK IN PROGRESS**
* IMPORTANT: Breaking change!! Please decommission ALL devices and do a full factory reset of the adapter Matter storage before installing this version. Pair the devices new afterwards. 
* (@Apollon77) Finalizes Devices, Bridges and Controller functionality
* (@Apollon77) Upgrades to new Matter.js version and API (breaks storage structure)
* (@GermanBluefox) Moved build process of GUI to vite

### 0.1.13 (2023-12-01)
* (@GermanBluefox) Working on the controller

### 0.1.10 (2023-11-13)
* (@GermanBluefox) Implemented the factory reset and re-announcing

### 0.1.2 (2023-10-25)
* (@GermanBluefox) Devices were implemented

### 0.0.5 (2023-10-24)
* (@GermanBluefox) Fixed names under linux

### 0.0.4 (2023-10-24)
* (@GermanBluefox) used library `@iobroker/type-detector`

### 0.0.2 (2023-10-23)
* (@GermanBluefox) Initial commit

## License
Apache-2.0

Copyright (c) 2023-2024 Denis Haev <dogafox@gmail.com>
