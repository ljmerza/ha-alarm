from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.hashers import make_password
from rest_framework import serializers

from .models import User, UserCode, UserCodeAllowedState

class OnboardingSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    username = serializers.EmailField(required=False)
    password = serializers.CharField(write_only=True)
    home_name = serializers.CharField(max_length=150)

    def validate(self, attrs):
        email = attrs.get("email") or attrs.get("username")
        if not email:
            raise serializers.ValidationError({"email": "Email is required."})
        attrs["email"] = email
        return attrs

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    displayName = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source="is_active")
    has2FA = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")
    lastLogin = serializers.DateTimeField(source="last_login", allow_null=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "displayName",
            "role",
            "isActive",
            "has2FA",
            "createdAt",
            "lastLogin",
        )

    def get_role(self, obj: User) -> str:
        assignment = obj.role_assignments.select_related("role").first()
        if assignment:
            return assignment.role.slug
        if obj.is_superuser:
            return "admin"
        return "resident"

    def get_displayName(self, obj: User) -> str:
        if obj.display_name:
            return obj.display_name
        full_name = obj.full_name
        return full_name or obj.email

    def get_has2FA(self, obj: User) -> bool:
        return obj.totp_devices.filter(is_active=True, confirmed_at__isnull=False).exists()


class UserCodeSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True)
    user_display_name = serializers.SerializerMethodField()
    allowed_states = serializers.SerializerMethodField()

    class Meta:
        model = UserCode
        fields = (
            "id",
            "user_id",
            "user_display_name",
            "label",
            "code_type",
            "pin_length",
            "is_active",
            "max_uses",
            "uses_count",
            "start_at",
            "end_at",
            "days_of_week",
            "window_start",
            "window_end",
            "last_used_at",
            "allowed_states",
            "created_at",
            "updated_at",
        )

    def get_user_display_name(self, obj: UserCode) -> str:
        user = obj.user
        if getattr(user, "display_name", ""):
            return user.display_name
        full_name = getattr(user, "full_name", "") or ""
        if full_name.strip():
            return full_name.strip()
        return user.email

    def get_allowed_states(self, obj: UserCode) -> list[str]:
        qs = obj.allowed_states.all()
        return sorted({row.state for row in qs})


DEFAULT_CODE_ALLOWED_STATES = [
    UserCodeAllowedState.AlarmState.ARMED_HOME,
    UserCodeAllowedState.AlarmState.ARMED_AWAY,
    UserCodeAllowedState.AlarmState.ARMED_NIGHT,
    UserCodeAllowedState.AlarmState.ARMED_VACATION,
    UserCodeAllowedState.AlarmState.ARMED_CUSTOM_BYPASS,
]


class UserCodeCreateSerializer(serializers.Serializer):
    reauth_password = serializers.CharField(write_only=True)
    code = serializers.CharField(write_only=True)
    label = serializers.CharField(max_length=150, required=False, allow_blank=True)
    user_id = serializers.UUIDField(required=False)
    code_type = serializers.ChoiceField(
        required=False,
        choices=UserCode.CodeType.choices,
        default=UserCode.CodeType.PERMANENT,
    )
    start_at = serializers.DateTimeField(required=False, allow_null=True)
    end_at = serializers.DateTimeField(required=False, allow_null=True)
    allowed_states = serializers.ListField(
        required=False,
        child=serializers.ChoiceField(choices=UserCodeAllowedState.AlarmState.choices),
    )

    def validate_code(self, value: str) -> str:
        code = (value or "").strip()
        if not code.isdigit():
            raise serializers.ValidationError("Code must be digits only.")
        if len(code) < 4 or len(code) > 8:
            raise serializers.ValidationError("Code must be 4 to 8 digits.")
        return code

    def validate(self, attrs):
        attrs = super().validate(attrs)
        code_type = attrs.get("code_type", UserCode.CodeType.PERMANENT)
        start_at = attrs.get("start_at")
        end_at = attrs.get("end_at")

        if code_type != UserCode.CodeType.TEMPORARY and (start_at is not None or end_at is not None):
            raise serializers.ValidationError(
                {"code_type": "Only temporary codes can set an active time range."}
            )
        if code_type == UserCode.CodeType.TEMPORARY and start_at and end_at and start_at > end_at:
            raise serializers.ValidationError(
                {"end_at": "end_at must be after or equal to start_at."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("reauth_password", None)
        raw = validated_data["code"]
        user = self.context["target_user"]
        code_type = validated_data.get("code_type", UserCode.CodeType.PERMANENT)
        code = UserCode.objects.create(
            user=user,
            code_hash=make_password(raw),
            label=validated_data.get("label", ""),
            code_type=code_type,
            pin_length=len(raw),
            is_active=True,
            start_at=validated_data.get("start_at"),
            end_at=validated_data.get("end_at"),
        )
        allowed_states = validated_data.get("allowed_states") or DEFAULT_CODE_ALLOWED_STATES
        UserCodeAllowedState.objects.bulk_create(
            [UserCodeAllowedState(code=code, state=state) for state in allowed_states],
            ignore_conflicts=True,
        )
        return code


class UserCodeUpdateSerializer(serializers.Serializer):
    reauth_password = serializers.CharField(write_only=True)
    code = serializers.CharField(write_only=True, required=False)
    label = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    start_at = serializers.DateTimeField(required=False, allow_null=True)
    end_at = serializers.DateTimeField(required=False, allow_null=True)
    allowed_states = serializers.ListField(
        required=False,
        child=serializers.ChoiceField(choices=UserCodeAllowedState.AlarmState.choices),
    )

    def validate_code(self, value: str) -> str:
        code = (value or "").strip()
        if not code.isdigit():
            raise serializers.ValidationError("Code must be digits only.")
        if len(code) < 4 or len(code) > 8:
            raise serializers.ValidationError("Code must be 4 to 8 digits.")
        return code

    def update(self, instance: UserCode, validated_data):
        validated_data.pop("reauth_password", None)
        raw = validated_data.pop("code", None)
        if raw:
            instance.code_hash = make_password(raw)
            instance.pin_length = len(raw)
        if "label" in validated_data:
            instance.label = validated_data["label"]
        if "is_active" in validated_data:
            instance.is_active = validated_data["is_active"]
        if "start_at" in validated_data or "end_at" in validated_data:
            if instance.code_type != UserCode.CodeType.TEMPORARY:
                raise serializers.ValidationError(
                    {"code_type": "Only temporary codes can set an active time range."}
                )
            start_at = validated_data.get("start_at", instance.start_at)
            end_at = validated_data.get("end_at", instance.end_at)
            if start_at and end_at and start_at > end_at:
                raise serializers.ValidationError(
                    {"end_at": "end_at must be after or equal to start_at."}
                )
            if "start_at" in validated_data:
                instance.start_at = validated_data["start_at"]
            if "end_at" in validated_data:
                instance.end_at = validated_data["end_at"]
        instance.save()

        if "allowed_states" in validated_data:
            new_states = validated_data.get("allowed_states") or []
            instance.allowed_states.all().delete()
            UserCodeAllowedState.objects.bulk_create(
                [UserCodeAllowedState(code=instance, state=state) for state in new_states],
                ignore_conflicts=True,
            )

        return instance
