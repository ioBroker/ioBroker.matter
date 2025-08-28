# GitHub Copilot Instructions for ioBroker.matter

## Project Overview

This is an ioBroker adapter for integrating Matter devices into the ioBroker home automation platform. The adapter supports both bridging ioBroker devices to Matter networks and controlling external Matter devices from ioBroker.

### Key Features
- Bridge ioBroker devices to Matter controllers (like Apple HomeKit, Google Home, Amazon Alexa)
- Connect and control external Matter devices
- Support for various device types (lights, sensors, switches, thermostats, etc.)
- Web-based admin interface for configuration
- Device auto-discovery and pairing

## Technology Stack

### Backend (src/)
- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Framework**: ioBroker Adapter Core (@iobroker/adapter-core)
- **Matter Library**: @matter/main, @project-chip/matter.js
- **Device Detection**: @iobroker/type-detector
- **Testing**: Mocha

### Frontend (src-admin/)
- **Language**: TypeScript/TSX
- **Framework**: React (class components)
- **UI Library**: Material-UI (@mui/material)
- **Build Tool**: Vite
- **State Management**: Component state (no Redux/Context)
- **Config**: @iobroker/json-config for dynamic forms

### Build & Development Tools
- **TypeScript Compiler**: tsc
- **Linting**: ESLint with @iobroker/eslint-config
- **Formatting**: Prettier
- **Testing**: Mocha with @iobroker/testing
- **CI/CD**: GitHub Actions

## Project Structure

```
├── src/                          # Backend TypeScript source
│   ├── main.ts                   # Main adapter entry point
│   ├── lib/                      # Shared libraries and utilities
│   │   ├── DeviceManagement.ts   # Device management logic
│   │   ├── devices/              # Device-specific implementations
│   │   └── i18n/                 # Internationalization files
│   └── matter/                   # Matter protocol implementations
│       ├── ControllerNode.ts     # Matter controller logic
│       ├── DeviceNode.ts         # Matter device implementations
│       └── BridgedDevicesNode.ts # Bridging logic
├── src-admin/                    # Frontend React admin interface
│   ├── src/
│   │   ├── App.tsx               # Main application component
│   │   ├── Tabs/                 # Tab components (Options, Bridges, Devices)
│   │   └── components/           # Reusable UI components
│   └── package.json              # Frontend dependencies
├── build/                        # Compiled backend code
├── admin/                        # Compiled frontend assets
├── test/                         # Test files
├── tasks.js                      # Custom build scripts
└── io-package.json               # ioBroker adapter metadata
```

## Coding Conventions

### TypeScript/JavaScript
- Use TypeScript strict mode
- Prefer explicit type annotations for public APIs
- Use async/await over Promises when possible
- Follow ESLint rules from @iobroker/eslint-config
- Use camelCase for variables and functions, PascalCase for classes and types

### React Frontend
- Use class components (legacy pattern in this codebase)
- Material-UI components for consistent styling
- TypeScript interfaces for component props and state
- Functional setState for state updates
- i18n for all user-facing strings using I18n.t()

### ioBroker Patterns
- Extend Adapter class from @iobroker/adapter-core
- Use adapter logging methods (this.log.info, this.log.error, etc.)
- Follow ioBroker object structure conventions
- Implement proper state subscriptions and unsubscriptions
- Handle adapter lifecycle methods (onReady, onUnload, etc.)

### Matter Integration
- Use Matter.js official libraries (@matter/main, @project-chip/matter.js)
- Implement proper device commissioning flows
- Handle Matter cluster implementations correctly
- Follow Matter specification for device types and features

## Build & Development Workflow

### Initial Setup
```bash
npm ci                    # Install backend dependencies
cd src-admin && npm ci    # Install frontend dependencies
```

### Development Commands
```bash
npm run build            # Build everything (backend + frontend)
npm run build:ts         # Build only TypeScript backend
npm run build:gui        # Build only React frontend
npm run lint             # Lint backend code
npm run lint-frontend    # Lint frontend code
npm test                 # Run tests
npm run dev-server       # Start development server
```

### Custom Build Tasks (tasks.js)
```bash
node tasks.js --0-clean  # Clean build directories
node tasks.js --1-npm    # Install frontend dependencies
node tasks.js --2-build  # Build frontend with Vite
node tasks.js --3-copy   # Copy files to admin directory
node tasks.js --4-patch  # Patch HTML files for ioBroker
```

## Key Architectural Patterns

### Adapter Main Class
- Located in `src/main.ts`
- Extends ioBroker Adapter class
- Manages Matter controller and device instances
- Handles state changes and device communication

### Device Management
- Device detection using @iobroker/type-detector
- Device factory pattern for creating Matter devices
- Subscription manager for state changes
- Device configuration through JSON forms

### Frontend Architecture
- Main App component manages global state and routing
- Tab-based navigation (Options, Controller, Bridges, Devices)
- Expert mode toggle for advanced features
- Dynamic JSON configuration forms

### Matter Integration
- Matter nodes extend base classes for consistent behavior
- Separate implementations for controllers, devices, and bridges
- Proper cluster implementations for different device types
- State synchronization between ioBroker and Matter

## Testing Guidelines

### Backend Tests
- Located in `test/` directory
- Use Mocha test framework
- Test adapter lifecycle and device operations
- Mock ioBroker adapter for unit tests

### Frontend Testing
- Limited test coverage currently
- Focus on component rendering and user interactions
- Test configuration forms and validation

## Common Gotchas

### ioBroker Specifics
- Always check `this.supportsFeature('ADAPTER_AUTO_DECRYPT_NATIVE')` for encrypted config
- Use proper ioBroker object IDs (dot-separated hierarchy)
- Handle adapter restarts gracefully
- Clean up subscriptions in onUnload

### Matter Integration
- Matter commissioning can take time - implement proper timeouts
- Device capabilities must match Matter cluster implementations
- Network configuration is critical for Matter communication
- Handle Matter fabric management carefully

### Build Process
- Vite build can be memory-intensive - watch for large chunks warning
- TypeScript compilation happens before frontend build
- i18n files must be copied manually to build directory
- Admin HTML files need patching for ioBroker integration

## Dependencies Management

### Backend Dependencies
- Keep @matter dependencies aligned (same version across packages)
- Update @iobroker packages together for compatibility
- Be cautious with Node.js crypto dependencies

### Frontend Dependencies
- Material-UI components should be consistent versions
- React version is constrained by ioBroker admin framework
- Vite configuration is optimized for ioBroker deployment

## Code Review Guidelines

### What to Check
- TypeScript types are properly defined
- Error handling is comprehensive
- Memory leaks are prevented (proper cleanup)
- ioBroker patterns are followed correctly
- Matter specifications are adhered to
- Internationalization is complete
- Performance impact of changes

### Security Considerations
- Validate all user inputs in admin interface
- Handle network credentials securely
- Prevent Matter commissioning attacks
- Sanitize device data before storing in ioBroker

When contributing to this project, always consider the impact on both ioBroker users and Matter ecosystem compatibility.