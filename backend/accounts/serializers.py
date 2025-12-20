from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.hashers import make_password
from rest_framework import serializers

from .models import User, UserCode

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
    class Meta:
        model = UserCode
        fields = (
            "id",
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
            "created_at",
            "updated_at",
        )


class UserCodeCreateSerializer(serializers.Serializer):
    code = serializers.CharField(write_only=True)
    label = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_code(self, value: str) -> str:
        code = (value or "").strip()
        if not code.isdigit():
            raise serializers.ValidationError("Code must be digits only.")
        if len(code) < 4 or len(code) > 8:
            raise serializers.ValidationError("Code must be 4 to 8 digits.")
        return code

    def create(self, validated_data):
        user = self.context["request"].user
        raw = validated_data["code"]
        return UserCode.objects.create(
            user=user,
            code_hash=make_password(raw),
            label=validated_data.get("label", ""),
            code_type=UserCode.CodeType.PERMANENT,
            pin_length=len(raw),
            is_active=True,
        )
