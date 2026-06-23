
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { hasPermission, SYSTEM_ROLE_PERMISSIONS, ECOSYSTEM_ROLE_PERMISSIONS } from '@boldmindng/utils';

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredPermissions || requiredPermissions.length === 0) return true;

        const { user } = context.switchToHttp().getRequest<{
            user: { id: string; email: string; role: string; permissions: string[] };
        }>();

        if (!user) throw new ForbiddenException('Authentication required');

        // Build user object compatible with hasPermission() from @boldmind/utils
        const userForCheck = {
            id: user.id,
            email: user.email,
            role: user.role as never,
            permissions: user.permissions,
            name: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const allGranted = requiredPermissions.every((perm) => hasPermission(userForCheck, perm));

        if (!allGranted) {
            throw new ForbiddenException(`Missing required permissions: ${requiredPermissions.join(', ')}`);
        }

        return true;
    }
}

