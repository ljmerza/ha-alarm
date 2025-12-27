from __future__ import annotations

from django.urls import path

from . import views

urlpatterns = [
    path("state/", views.AlarmStateView.as_view(), name="alarm-state"),
    path("zwavejs/status/", views.ZwavejsStatusView.as_view(), name="zwavejs-status"),
    path("zwavejs/settings/", views.ZwavejsSettingsView.as_view(), name="zwavejs-settings"),
    path("zwavejs/test/", views.ZwavejsTestConnectionView.as_view(), name="zwavejs-test"),
    path("zwavejs/entities/sync/", views.ZwavejsEntitySyncView.as_view(), name="zwavejs-entities-sync"),
    path("zwavejs/set-value/", views.ZwavejsSetValueView.as_view(), name="zwavejs-set-value"),
    path("mqtt/status/", views.MqttStatusView.as_view(), name="mqtt-status"),
    path("mqtt/settings/", views.MqttSettingsView.as_view(), name="mqtt-settings"),
    path("mqtt/test/", views.MqttTestConnectionView.as_view(), name="mqtt-test"),
    path(
        "integrations/home-assistant/mqtt-alarm-entity/status/",
        views.HomeAssistantMqttAlarmEntityStatusView.as_view(),
        name="integrations-ha-mqtt-alarm-entity-status",
    ),
    path(
        "integrations/home-assistant/mqtt-alarm-entity/",
        views.HomeAssistantMqttAlarmEntitySettingsView.as_view(),
        name="integrations-ha-mqtt-alarm-entity",
    ),
    path(
        "integrations/home-assistant/mqtt-alarm-entity/publish-discovery/",
        views.HomeAssistantMqttAlarmEntityPublishDiscoveryView.as_view(),
        name="integrations-ha-mqtt-alarm-entity-publish-discovery",
    ),
    path("home-assistant/status/", views.HomeAssistantStatusView.as_view(), name="ha-status"),
    path("home-assistant/entities/", views.HomeAssistantEntitiesView.as_view(), name="ha-entities"),
    path(
        "home-assistant/notify-services/",
        views.HomeAssistantNotifyServicesView.as_view(),
        name="ha-notify-services",
    ),
    path("entities/", views.EntitiesView.as_view(), name="alarm-entities"),
    path("entities/sync/", views.EntitySyncView.as_view(), name="alarm-entities-sync"),
    path("settings/", views.AlarmSettingsView.as_view(), name="alarm-settings"),
    path("settings/profiles/", views.AlarmSettingsProfilesView.as_view(), name="alarm-settings-profiles"),
    path(
        "settings/profiles/<int:profile_id>/",
        views.AlarmSettingsProfileDetailView.as_view(),
        name="alarm-settings-profile-detail",
    ),
    path(
        "settings/profiles/<int:profile_id>/activate/",
        views.AlarmSettingsProfileActivateView.as_view(),
        name="alarm-settings-profile-activate",
    ),
    path("settings/timing/<str:state>/", views.AlarmSettingsTimingView.as_view(), name="alarm-settings-timing"),
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
