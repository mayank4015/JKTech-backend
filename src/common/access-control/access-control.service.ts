import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';

import { Role } from '../../auth/types/role.types';

export interface Permission {
  resource: string;
  action: string;
}

export interface AccessControlRule {
  role: Role;
  permissions: Permission[];
}

@Injectable()
export class AccessControlService {
  private readonly accessRules: AccessControlRule[] = [
    {
      role: Role.ADMIN,
      permissions: [
        { resource: '*', action: '*' }, // Admin has all permissions
      ],
    },
    {
      role: Role.EDITOR,
      permissions: [
        { resource: 'users', action: 'read' },
        { resource: 'documents', action: '*' },
        { resource: 'profile', action: 'read' },
        { resource: 'profile', action: 'update' },
      ],
    },
    {
      role: Role.VIEWER,
      permissions: [
        { resource: 'documents', action: 'read' },
        { resource: 'profile', action: 'read' },
        { resource: 'profile', action: 'update' },
      ],
    },
  ];

  hasPermission(user: User, resource: string, action: string): boolean {
    if (!user || !user.isActive) {
      return false;
    }

    const userRole = user.role as Role;
    const rule = this.accessRules.find((rule) => rule.role === userRole);

    if (!rule) {
      return false;
    }

    return rule.permissions.some((permission) => {
      const resourceMatch =
        permission.resource === '*' || permission.resource === resource;
      const actionMatch =
        permission.action === '*' || permission.action === action;

      return resourceMatch && actionMatch;
    });
  }

  canAccessResource(user: User, resource: string): boolean {
    return this.hasPermission(user, resource, 'read');
  }

  canModifyResource(user: User, resource: string): boolean {
    return (
      this.hasPermission(user, resource, 'update') ||
      this.hasPermission(user, resource, 'delete')
    );
  }

  canCreateResource(user: User, resource: string): boolean {
    return this.hasPermission(user, resource, 'create');
  }

  isOwnerOrHasPermission(
    user: User,
    resource: string,
    action: string,
    resourceOwnerId?: string,
  ): boolean {
    // Check if user is the owner of the resource
    if (resourceOwnerId && user.id === resourceOwnerId) {
      return true;
    }

    // Check if user has permission through role
    return this.hasPermission(user, resource, action);
  }

  getPermissionsForRole(role: Role): Permission[] {
    const rule = this.accessRules.find((rule) => rule.role === role);
    return rule ? rule.permissions : [];
  }

  getAllowedActions(user: User, resource: string): string[] {
    if (!user || !user.isActive) {
      return [];
    }

    const userRole = user.role as Role;
    const rule = this.accessRules.find((rule) => rule.role === userRole);

    if (!rule) {
      return [];
    }

    const allowedActions: string[] = [];

    rule.permissions.forEach((permission) => {
      if (permission.resource === '*' || permission.resource === resource) {
        if (permission.action === '*') {
          allowedActions.push('create', 'read', 'update', 'delete');
        } else {
          allowedActions.push(permission.action);
        }
      }
    });

    return [...new Set(allowedActions)]; // Remove duplicates
  }

  isAdmin(user: User): boolean {
    return user?.role === Role.ADMIN && user.isActive;
  }

  isEditor(user: User): boolean {
    return user?.role === Role.EDITOR && user.isActive;
  }

  isViewer(user: User): boolean {
    return user?.role === Role.VIEWER && user.isActive;
  }
}
