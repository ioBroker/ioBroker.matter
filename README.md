![Logo](admin/matter.png)
# ioBroker Matter Adapter

![Number of Installations](http://iobroker.live/badges/matter-installed.svg)
![Number of Installations](http://iobroker.live/badges/matter-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.matter.svg)](https://www.npmjs.com/package/iobroker.matter)

![Test and Release](https://github.com/ioBroker/ioBroker.matter/workflows/Test%20and%20Release/badge.svg)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/matter/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)
[![Downloads](https://img.shields.io/npm/dm/iobroker.matter.svg)](https://www.npmjs.com/package/iobroker.matter)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
## ToDo
- Controller
- Get login & pass from iot (new js-controller version) may be
- passcode editable
- discriminator editable ?
- ble
- fake delete (so the real deletion will be done in backend with factory reset of device)

## Changelog
### 0.1.3 (2023-11-11)
* (bluefox) Implemented the factory reset and re-announcing

### 0.1.2 (2023-10-25)
* (bluefox) Devices were implemented

### 0.0.5 (2023-10-24)
* (bluefox) Fixed names under linux

### 0.0.4 (2023-10-24)
* (bluefox) used library `@iobroker/type-detector`

### 0.0.2 (2023-10-23)
* (bluefox) Initial commit

## License
Apache-2.0

Copyright (c) 2023 Denis Haev <dogafox@gmail.com>
