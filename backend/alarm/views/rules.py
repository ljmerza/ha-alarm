from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm.models import Rule
from alarm.serializers import RuleSerializer, RuleUpsertSerializer
from alarm.use_cases import rules as rules_uc
from config.view_utils import ObjectPermissionMixin


class RulesView(APIView):
    def get(self, request):
        queryset = rules_uc.list_rules(
            kind=request.query_params.get("kind"),
            enabled=request.query_params.get("enabled"),
        )
        return Response(RuleSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = RuleUpsertSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(created_by=request.user)
        return Response(RuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class RuleDetailView(ObjectPermissionMixin, APIView):
    def get(self, request, rule_id: int):
        rule = self.get_object_or_404(
            request,
            queryset=Rule.objects.all().prefetch_related("entity_refs__entity"),
            pk=rule_id,
        )
        return Response(RuleSerializer(rule).data, status=status.HTTP_200_OK)

    def patch(self, request, rule_id: int):
        rule = self.get_object_or_404(
            request,
            queryset=Rule.objects.all().prefetch_related("entity_refs__entity"),
            pk=rule_id,
        )
        serializer = RuleUpsertSerializer(rule, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        rule = serializer.save()
        return Response(RuleSerializer(rule).data, status=status.HTTP_200_OK)

    def delete(self, request, rule_id: int):
        rule = self.get_object_or_404(
            request,
            queryset=Rule.objects.all().prefetch_related("entity_refs__entity"),
            pk=rule_id,
        )
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RuleRunView(APIView):
    def post(self, request):
        result = rules_uc.run_rules(actor_user=request.user)
        return Response(result.as_dict(), status=status.HTTP_200_OK)


class RuleSimulateView(APIView):
    def post(self, request):
        input_data = rules_uc.parse_simulate_input(request.data)
        result = rules_uc.simulate_rules(input_data=input_data)
        return Response(result, status=status.HTTP_200_OK)
