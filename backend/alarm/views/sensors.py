from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm.models import Sensor
from alarm.serializers import SensorCreateSerializer, SensorSerializer, SensorUpdateSerializer
from alarm.use_cases.sensor_context import sensor_detail_serializer_context, sensor_list_serializer_context


class SensorsView(APIView):
    def get(self, request):
        sensors = Sensor.objects.all()
        context = sensor_list_serializer_context(sensors=list(sensors), prefer_home_assistant_live_state=True)
        return Response(SensorSerializer(sensors, many=True, context=context).data)

    def post(self, request):
        serializer = SensorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sensor = serializer.save()
        return Response(SensorSerializer(sensor).data, status=status.HTTP_201_CREATED)


class SensorDetailView(APIView):
    def get(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        context = sensor_detail_serializer_context(sensor=sensor, prefer_home_assistant_live_state=True)
        return Response(SensorSerializer(sensor, context=context).data)

    def patch(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        serializer = SensorUpdateSerializer(sensor, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        sensor = serializer.save()
        context = sensor_detail_serializer_context(sensor=sensor, prefer_home_assistant_live_state=False)
        return Response(SensorSerializer(sensor, context=context).data, status=status.HTTP_200_OK)

    def delete(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        sensor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

