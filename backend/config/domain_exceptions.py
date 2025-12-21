from __future__ import annotations


class DomainError(Exception):
    """
    Base class for predictable, user-facing domain/use-case errors.
    """


class ValidationError(DomainError):
    pass


class UnauthorizedError(DomainError):
    pass


class ForbiddenError(DomainError):
    pass


class NotFoundError(DomainError):
    pass


class ConflictError(DomainError):
    pass


class ServiceUnavailableError(DomainError):
    pass
