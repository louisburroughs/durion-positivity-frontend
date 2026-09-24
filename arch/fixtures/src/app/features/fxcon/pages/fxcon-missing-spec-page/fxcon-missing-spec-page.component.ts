import { Component } from '@angular/core';

/** CON-04 self-test fixture: violating — templateUrl/styleUrl exist, but the spec is missing. */
@Component({
  selector: 'app-fxcon-missing-spec-page',
  standalone: true,
  templateUrl: './fxcon-missing-spec-page.component.html',
  styleUrl: './fxcon-missing-spec-page.component.css',
})
export class FxconMissingSpecPageComponent {}
