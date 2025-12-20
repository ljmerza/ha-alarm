from __future__ import annotations

from django.urls import path

from . import views

urlpatterns = [
    path("state/", views.AlarmStateView.as_view(), name="alarm-state"),
    path("home-assistant/status/", views.HomeAssistantStatusView.as_view(), name="ha-status"),
    path("home-assistant/entities/", views.HomeAssistantEntitiesView.as_view(), name="ha-entities"),
    path("settings/", views.AlarmSettingsView.as_view(), name="alarm-settings"),
    path("zones/", views.ZonesView.as_view(), name="alarm-zones"),
    path("sensors/", views.SensorsView.as_view(), name="alarm-sensors"),
    path("arm/", views.ArmAlarmView.as_view(), name="alarm-arm"),
    path("disarm/", views.DisarmAlarmView.as_view(), name="alarm-disarm"),
    path("cancel-arming/", views.CancelArmingView.as_view(), name="alarm-cancel-arming"),
]
