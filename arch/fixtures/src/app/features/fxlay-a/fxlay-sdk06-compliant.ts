import { environment } from '../../../environments/environment';

// Reading a different environment property must not trip the apiBaseUrl-only finder.
export const FXLAY_SDK06_COMPLIANT = environment.production;
