// agGridModules.ts - Registers the AG Grid modules the blotters use (AG Grid 33+ ships features as
// modules that must be registered once). Imported for its side effect by both grids.
//
// The list is theme/gridModules.ts (SPEC-0060), proven complete and minimal by
// theme/gridModules.test.tsx. A feature whose module is missing fails at run time with AG Grid
// error #200 (SPEC-0057 saw it as a live grid with no rows); ValidationModule reports that error
// in the console, so it is registered in development and left out of the production bundle.
import { ModuleRegistry, ValidationModule } from 'ag-grid-community';
import { OMS_GRID_MODULES } from './gridModules';

ModuleRegistry.registerModules(
  process.env.NODE_ENV === 'production' ? OMS_GRID_MODULES : [...OMS_GRID_MODULES, ValidationModule],
);
