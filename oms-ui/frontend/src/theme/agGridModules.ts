// agGridModules.ts - Registers AG Grid's features (AG Grid 33+ ships them as modules that must be
// registered once). Imported for its side effect by both grids.
//
// All Community modules, not a hand-picked list: the grids use the client-side row model,
// api.applyTransaction (the live blotter, SPEC-0057), cell change flashing, column auto-size, sorting
// and column filters. Without its module a feature fails at run time with AG Grid error #200 (seen as
// a live grid that showed no rows), and nothing at build or test time catches a missing one.
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);
