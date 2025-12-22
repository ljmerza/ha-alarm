from __future__ import annotations

from django.contrib import admin
from django.urls import include, path

from alarm import views as alarm_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/alarm/", include("alarm.urls")),
    path("api/events/", alarm_views.AlarmEventsView.as_view(), name="events"),
    path("api/system-config/", alarm_views.SystemConfigListView.as_view(), name="system-config-list"),
    path("api/system-config/<str:key>/", alarm_views.SystemConfigDetailView.as_view(), name="system-config-detail"),
    path("api/", include("accounts.urls")),
]
