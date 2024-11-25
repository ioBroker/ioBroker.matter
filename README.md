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

## Important Information (READ FIRST!)
* **Never delete partial matter instance objects or object trees!** The configuration for this adapter is **not** contained in just one central object like in other ore simple adapters. This means that deleting instance objects or object trees can lead to a broken configuration and you might need to reconfigure the adapter from scratch.
* **Never reinstall the adapter by deleting the instance** if you want to keep paired devices (e.g. on Controller) or paired Controllers (e.g. on Bridges). If you delete the instance all paired devices will be deleted and you need to pair them again.
* **Use an ioBroker Backup to backup the configuration** and restore the backup to restore it. If really needed without backup then export the whole object tree of the adapter instance (e.g. matter.0) and import it back if needed. These can be a high number of objects depending on the number of devices and controllers you have paired.
* Some objects are not shown by default because they are irrelevant for normal operation. If you need to see them you can enable the "Expert Mode" in the adapter settings. This mainly is about the "storage" objects. Please **do not** change them unless you really really know what you are doing!

## Prerequisites to use this adapter

### General prerequisites
* One instance of the adapter is bound to one host (aka IP). Multiple instances require a multi-host setup.
* Make sure IPv6 is enabled in your network and the host you use this adapter on has an IPv6 address
  * If you use LXC containers in Proxmox this is like **not** given because Proxmox hosts are normally not configured for IPv6!
* Make sure that UDP packages can flow between the devices, your mobile app, the hubs and the host you use this adapter on!
  * Mainly make sure to **not** use VLANs, because UDP is usually not routed between VLANs! Or find out how to configure your router to allow this (Fritzbox does not work with this!)
  * If you use Docker containers make sure to use **Host Mode** to allow UDP packages to flow between the containers and the host. Bridged network mode does not work with UDP packages!

### Prerequisites to Expose ioBroker devices as Matter Bridges or Devices
Important: In order to expose more then 5 Bridged devices or to expose additional separate Devices or Bridges you need to have a Matter Pro Account with an active Assistant or Remote Control License and entering this into the adapter configuration! Please support our team with the efforts we invest in Matter with this. Controller usage is not limited by this.

* The Bridges and devices that the ioBroker Adapter exposes are not officially certified by the Matter organization. This means they only work in Ecosystems that allow this.
  * For Google additional steps might be needed - see https://github.com/project-chip/matter.js/blob/main/docs/ECOSYSTEMS.md#google-home-ecosystem
  * **Aqara Hub M3** and **Yandex** are currently (as of November 2024) not allow "uncertified devices" to be paired!
* Each Ecosystem has different limits about devices per Bridge and such. So if a high number of devices (there are test results up to 64 which should work at least in Apple, Google and - a bit wonky - Amazon) one bridge makes issues. please try splitting it up to multiple bridges. I would also be happy to find out the practical limits so please report your experiences.
* For Alexa currently only the "Default Bridge" can be used on a host. Multiple Bridges to use with Alexa are only possible on different hosts.

### Prerequisites to use Matter devices in ioBroker (aka "Matter Controller")
* If you plan to use Thread based devices (check the package for information) you need to have a Thread Border Router (TBR) in your network. Check https://github.com/project-chip/matter.js/blob/main/docs/ECOSYSTEMS.md for more information about the ecosystems and their Thread support. More information on Thread and also on how to add an own TBR can be found at https://github.com/project-chip/matter.js/blob/main/docs/USAGE_THREAD.md
* If you run on Linux and plan to use Thread based devices and have issues connecting to them please refer to https://github.com/project-chip/matter.js/blob/main/docs/TROUBLESHOOTING.md#ipv6-linux-system-details for instructions how to tweak the IPv6 configuration on your Linux system.
* Initial commissioning of devices is possible with the "ioBroker Visu App" which uses the BLE of your mobile device and is the most convenient way. You can also use the BLE of your ioBroker host but then the device also needs to be in BLE range of your host. When using the App you need an ioBroker Pro Account with an active Assistant or Remote Control License.

## Supported devices

### Supported ioBroker device types

| ioBroker Device Type | Mapped to Matter Device Type |
|----------------------|------------------------------|
| Ct                   | Color Temperature Light      |
| Dimmer               | Dimmable Light               |
| Door                 | Contact Sensor               |
| Flood Alarm          | Water Leak Detector          |
| Humidity             | Humidity Sensor              |
| Light                | OnOff Light                  |
| Lock                 | Door Lock                    |
| Motion               | Occupancy Sensor             |
| Socket               | OnOff PlugIn                 |
| Temperature          | Temperature Sensor           |
| Window               | Contact Sensor               |

... more to come

### Supported Matter device types

| Matter Device Type      | Mapped to ioBroker Device Type |
|-------------------------|--------------------------------|
| Color Temperature Light | Ct                             |
| Dimmable Light          | Dimmer                         |
| Dimmable PlugIn Unit    | Dimmer                         |
| Contact Sensor          | Window                         |
| Energy Sensor           | Light with only energy states  |
| Humidity Sensor         | Humidity                       |
| OnOff Light             | Light                          |
| Door Lock               | Lock                           |
| Occupancy Sensor        | Motion                         |
| OnOff PlugIn Unit       | Socket                         |
| Temperature Sensor      | Temperature                    |
| Water Leak Detector     | Flood Alarm                    |

... more to come

## Usage information
TBD

### Wording: Node vs Device
TBD

### Using the Matter Controller
TBD

#### Pairing nodes
TBD

#### Overview of the nodes and devices (UI)
TBD

#### Overview of the devices (Objects)
TBD

#### Using the devices (ioBroker Device compatible states)
This is the default mode for all supported device types where ioBroker has a matching own device type. In this case the functionality is conveniently abstracted as defined in ioBroker and how it is mapped for many other adapter states. The exposed functionality is limited to what ioBroker defines for the device type and should allow all normal operations.

If you need more granularity and access to device specific functionality or settings you can enable the "Application Cluster states" for this node or device to gain access (see below).

#### Using the Application Cluster states (needs to be enabled!)
Note: This is considered Advanced Usage!

Sometimes it might be handy to also see more internal details of the device or to access more specific functionality of the device. In this case you can enable the "Application Cluster states" for the node or device. This e.g. allows to set the sensitivity for a motion sensor. When enabled for a node (valid then for all devices exposed by the node) or a device you will see a lot of additional states in an objects folder "data". 

The details are structured by the application cluster and separated in attributes (data states) and commands. The exact meaning, units and allowed values and ranges for the data can be taken from the Matter Application Specification document.
When commands are exposed as a "button" then the action can be triggered by just setting a boolean value to the state. But most commands require more data (these are "json" strings) and require that a json string with all command fields are provided. The exact definition of the command fields can be taken from the Matter Application Specification document.

#### Using the System Cluster states (needs to be enabled!)
Note: This is considered Professional Usage!

In all normal end user cases you should not need to use the System Cluster states. They are only needed for special cases and for debugging or to deeply explore the Matter cluster data. If you enable them you will see a lot of additional states that are not needed for normal operation. Any changes to the writable states can break the functionality of the devices. So please only use them if you know what you are doing!

### Using the Matter Bridges

#### Recommendations
* Not all ecosystems support all device types and sometimes ecosystems react strange when you add a device type they do not support. So please check the ecosystem documentation for the supported device types, if available or try it out. We try to collect the details in the [Supported ioBroker devices](#supported-iobroker-device-types) section. Please report any new information as an issue or PR.
* If you plan to use bridges with many devices so please consider commissioning the bridge initially with just some added devices and then add more overtime. This can help to avoid issues with the ecosystems and also could be a better experience for you. 

### Using the Matter Devices
TBD

## Troubleshooting
* On Linux especially see https://github.com/project-chip/matter.js/blob/main/docs/TROUBLESHOOTING.md

### Troubleshooting for Devices and Bridges
* With Alexa only the Default bridge can be used on a host. Multiple Bridges to use with Alexa are only possible on different hosts.
* When an Ecosystem shows the device as disconnected, especially after an adapter restart, then this usually means that the controller has not yet reconnected to the device. This can take some time. If it does not reconnect after a few minutes then please check the connection information in the UI. If an ecosystem is not connecting at all please check logs and potentially debug logs and open an issue.

### Troubleshooting for the Controller


## How to report issues
* Please check [Prerequisites to use this adapter](#prerequisites-to-use-this-adapter) and [Troubleshooting](#troubleshooting) first
* Check that you are using the latest version available - or if not, if the changelog for the versions since your version contain information about your issue. Then try updating first please.
* Check existing open GitHub issues. If your's is also listed there vote for it by adding a thumbs up on first comment. This helps to prioritize the issues. "Me Too" posts are not needed.
* Create a GitHub issue if your issue is not existing
* Turn on Debug logs fpr the matter instance, and additionally "Matter Debug" logs on the main page of the adapter settings. Include the logs (as Text file please, Logfile location usually /opt/iobroker/logs/...) as text file attachment in your issue report. Please do not cut only the error but also add some minutes of log before and after the error to get some more context. Please also include information on what exactly is seen there, what was done and such. The more context you can provide the better.


## ToDo
* Texts are partially in english
* Sync min/max from Matter into ioBroker objects
* Cleanup objects when devices/states are removed
* ioBroker device types
  * (9) Lights:
    * rgb
    * rgbwSingle
    * rgbSingle
    * cie
    * hue
  * (8) blinds
  * (-8) thermostat
  * (5+2) button
  * (5+2) buttonSensor?
  * (3+) vacuumCleaner
  * (3) volume, volumeGroup
  * (-3) airCondition
  * (2+) fireAlarm
  * (-2) mediaPlayer
  * warning - how?
  * blindButtons - with bindings?
  * gate - aka blinds?
  * windowTilt - how?
  * levelSlider - how?
* Matter device types
  * (9) Enhanced Color Light -> rgb/rgbw/cie/hue/...
  * (8) Thermostat -> thermostat
  * (8) Window Covering -> blinds
  * (7+) Light Sensor -> ??? DEF
  * (7) Fan -> thermostat?
  * (5+2) Generic Switch -> button? buttonSensor?
  * (4+) Air Quality Sensor -> ???
  * (4+) Air Purifier -> ???
  * (4) Pump -> ???
  * (4) Pressure Sensor -> ??? DEF
  * (3+) Robot Vacuum cleaner -> vacuumCleaner
  * (3) Flow Sensor -> ??? DEF
  * (3) Room Air Conditioner -> airCondition
  * (2+) Smoke & CO Alarm -> fireAlarm? warning? 
  * (2+) Speaker -> volume, volumeGroup
  * (2+) Dishwasher-> ???
  * (2) Basic Video Player -> mediaPlayer
  * (2) Laundry Washer -> ???
  * (2) Refrigerator -> ???
  * (2) Temperature Controlled Cabinet -> ???
  * (2) Water Freeze Detector -> warning?
  * (2) Rain Sensor -> warning?
  * (2) Water Valve -> ???
  * (2) Laundry Dryer -> ???
  * (2) Oven -> ???
  * (2) Cooktop -> ???
  * (2) Cook Surface -> ???
  * (2) Extractor Hood -> ???
  * (2) Microwave Oven -> ???
  * (1+) Electrical Vehicle Supply Equipment -> ???
  * (0) Water Heater -> ???
  * (0) Solar Power -> ???
  * (0) Battery Storage -> ???
  * (0) Heat Pump -> ???
 

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
