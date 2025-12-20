from __future__ import annotations

from django.contrib import admin
from django.urls import include, path

from alarm import views as alarm_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/alarm/", include("alarm.urls")),
    path("api/events/", alarm_views.AlarmEventsView.as_view(), name="events"),
    path("api/", include("accounts.urls")),
]
