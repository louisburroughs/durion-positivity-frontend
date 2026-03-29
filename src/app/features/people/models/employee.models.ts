export enum EmploymentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  TERMINATED = 'TERMINATED',
}

export interface Employee {
  employeeId: string;
  firstName: string;
  lastName: string;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  email?: string;
  phone?: string;
  department?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateEmployeeRequest = Omit<Employee, 'employeeId' | 'createdAt' | 'updatedAt'>;
export type UpdateEmployeeRequest = Partial<CreateEmployeeRequest>;

export interface DisableEmployeeRequest {
  offboardDate: string;
  reason?: string;
}
