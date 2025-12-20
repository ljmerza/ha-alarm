from __future__ import annotations

from django.urls import path

from . import views

urlpatterns = [
    path("state/", views.AlarmStateView.as_view(), name="alarm-state"),
    path("home-assistant/status/", views.HomeAssistantStatusView.as_view(), name="ha-status"),
    path("home-assistant/entities/", views.HomeAssistantEntitiesView.as_view(), name="ha-entities"),
    path("entities/", views.EntitiesView.as_view(), name="alarm-entities"),
    path("entities/sync/", views.EntitySyncView.as_view(), name="alarm-entities-sync"),
    path("settings/", views.AlarmSettingsView.as_view(), name="alarm-settings"),
    path("sensors/", views.SensorsView.as_view(), name="alarm-sensors"),
    path("sensors/<int:sensor_id>/", views.SensorDetailView.as_view(), name="alarm-sensor-detail"),
    path("rules/", views.RulesView.as_view(), name="alarm-rules"),
    path("rules/<int:rule_id>/", views.RuleDetailView.as_view(), name="alarm-rule-detail"),
    path("rules/run/", views.RuleRunView.as_view(), name="alarm-rules-run"),
    path("rules/simulate/", views.RuleSimulateView.as_view(), name="alarm-rules-simulate"),
    path("arm/", views.ArmAlarmView.as_view(), name="alarm-arm"),
    path("disarm/", views.DisarmAlarmView.as_view(), name="alarm-disarm"),
    path("cancel-arming/", views.CancelArmingView.as_view(), name="alarm-cancel-arming"),
]
