import { User } from '@prisma/client';
import { CreateUserByAdminDto } from '../users.service';

export const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
export const TEST_USER_ID_2 = '123e4567-e89b-12d3-a456-426614174001';
export const SPECIFIC_TEST_USER_ID = '987e6543-e21b-43d2-a654-321987654321';

export const mockUser: User = {
  id: TEST_USER_ID,
  email: 'test@example.com',
  name: 'Test User',
  role: 'editor',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

export const mockUsers: User[] = [
  mockUser,
  {
    id: TEST_USER_ID_2,
    email: 'user2@example.com',
    name: 'User Two',
    role: 'viewer',
    isActive: false,
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  },
];

export const createUserDto: CreateUserByAdminDto = {
  name: 'New User',
  email: 'newuser@example.com',
  password: 'securePassword123',
  role: 'editor',
};

export const mockPaginatedResponse = {
  data: [mockUser],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
};

export const expectedUserCreateResponse = {
  user: {
    id: mockUser.id,
    email: createUserDto.email,
    name: createUserDto.name,
    role: createUserDto.role,
  },
  message: 'User created successfully',
};

// Common test error messages
export const TEST_ERRORS = {
  EMAIL_EXISTS: 'Email already exists',
  INVALID_EMAIL: 'Invalid email format',
  USER_NOT_FOUND: 'User not found',
  DB_CONNECTION_FAILED: 'Database connection failed',
  INVALID_UUID: 'Invalid UUID format',
  COUNT_FAILED: 'Count failed',
  UNIQUE_CONSTRAINT: 'Unique constraint violation',
  FOREIGN_KEY_CONSTRAINT: 'Foreign key constraint violation',
  UPDATE_FAILED: 'Update failed',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  REQUEST_TIMEOUT: 'Request timeout',
  CONSTRAINT_VIOLATION: 'Cannot delete user with associated records',
} as const;
