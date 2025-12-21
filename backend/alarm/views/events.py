from __future__ import annotations

from django.core.paginator import Paginator
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm.models import AlarmEvent
from alarm.serializers import AlarmEventSerializer


class AlarmEventsView(APIView):
    def get(self, request):
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
        ordering = request.query_params.get("ordering", "-timestamp")
        if ordering not in {"timestamp", "-timestamp"}:
            ordering = "-timestamp"

        queryset = AlarmEvent.objects.all().order_by(ordering)
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)

        return Response(
            {
                "data": AlarmEventSerializer(page_obj.object_list, many=True).data,
                "total": paginator.count,
                "page": page_obj.number,
                "page_size": page_size,
                "total_pages": paginator.num_pages,
                "has_next": page_obj.has_next(),
                "has_previous": page_obj.has_previous(),
                "timestamp": timezone.now(),
            }
        )

