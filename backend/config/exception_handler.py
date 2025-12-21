from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


def custom_exception_handler(exc, context):
    """
    Central exception->HTTP mapping for domain/use-case exceptions.

    Keep views/controllers thin: raise meaningful exceptions and let this layer
    translate them into consistent API responses.
    """

    response = drf_exception_handler(exc, context)
    if response is not None:
        return response

    # Local imports to avoid import-time side effects.
    from accounts.use_cases import auth as auth_uc
    from accounts.use_cases import codes as codes_uc
    from accounts.use_cases import onboarding as onboarding_uc
    from alarm import home_assistant
    from alarm.state_machine.errors import TransitionError
    from alarm.use_cases import alarm_actions
    from alarm.use_cases import rules as rules_uc

    if isinstance(exc, auth_uc.InvalidCredentials):
        return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
    if isinstance(exc, auth_uc.InvalidRefreshToken):
        return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

    if isinstance(exc, onboarding_uc.OnboardingAlreadyCompleted):
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

    if isinstance(exc, codes_uc.ReauthRequired):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, codes_uc.ReauthFailed):
        return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
    if isinstance(exc, codes_uc.Forbidden):
        return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
    if isinstance(exc, codes_uc.NotFound):
        return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

    if isinstance(exc, alarm_actions.InvalidTargetState):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, alarm_actions.CodeRequired):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, alarm_actions.InvalidCode):
        return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

    if isinstance(exc, rules_uc.RuleSimulateInputError):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, home_assistant.HomeAssistantNotConfigured):
        return Response({"detail": str(exc) or "Home Assistant is not configured."}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, home_assistant.HomeAssistantNotReachable):
        return Response(
            {"detail": "Home Assistant is not reachable.", "error": getattr(exc, "error", None)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    if isinstance(exc, TransitionError):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return None

