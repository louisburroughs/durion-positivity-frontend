import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AccountingComponent {}
