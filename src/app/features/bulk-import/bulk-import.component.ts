import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-bulk-import',
  standalone: true,
  templateUrl: './bulk-import.component.html',
  styleUrl: './bulk-import.component.css',
  imports: [RouterOutlet],
})
export class BulkImportComponent {}
