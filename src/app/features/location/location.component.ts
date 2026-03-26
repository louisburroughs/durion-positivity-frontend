import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-location',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class LocationComponent {}
