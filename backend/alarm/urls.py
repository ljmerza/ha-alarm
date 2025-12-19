from __future__ import annotations

from django.urls import path

from . import views

urlpatterns = [
    path("state/", views.AlarmStateView.as_view(), name="alarm-state"),
    path("arm/", views.ArmAlarmView.as_view(), name="alarm-arm"),
    path("disarm/", views.DisarmAlarmView.as_view(), name="alarm-disarm"),
    path("cancel-arming/", views.CancelArmingView.as_view(), name="alarm-cancel-arming"),
]
